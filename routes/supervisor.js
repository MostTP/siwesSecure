import express from 'express';
import pool from '../config/database.js';
import { authRequired, requireVerifiedSupervisor, requireRole } from '../middleware/auth.js';
import { generateHash } from '../utils/auth.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Get assigned students (INDUSTRY_SUPERVISOR)
router.get('/students', authRequired, requireVerifiedSupervisor, requireRole('INDUSTRY_SUPERVISOR'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.matric_number, s.full_name, s.institution, s.department, 
              s.siwes_start_date, s.siwes_end_date
       FROM students s
       JOIN student_supervisor_assignments ssa ON s.id = ssa.student_id
       WHERE ssa.industry_supervisor_id = $1`,
      [req.user.id]
    );

    res.json({ students: result.rows });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get student's weekly logs (INDUSTRY_SUPERVISOR)
router.get('/students/:studentId/logs', authRequired, requireVerifiedSupervisor, requireRole('INDUSTRY_SUPERVISOR'), async (req, res) => {
  try {
    const { studentId } = req.params;

    // Verify supervisor is assigned to this student
    const assignmentCheck = await pool.query(
      'SELECT id FROM student_supervisor_assignments WHERE student_id = $1 AND industry_supervisor_id = $2',
      [studentId, req.user.id]
    );

    if (!assignmentCheck.rows[0]) {
      await logAudit(req.user.id, 'INDUSTRY_SUPERVISOR', 'UNAUTHORIZED_ACCESS', `student_${studentId}`, false, req.ip);
      return res.status(403).json({ error: 'Not assigned to this student' });
    }

    const result = await pool.query(
      `SELECT id, entry_date, week_number, activity_description, status, created_at
       FROM log_entries WHERE student_id = $1 ORDER BY entry_date DESC`,
      [studentId]
    );

    res.json({ log_entries: result.rows });
  } catch (error) {
    console.error('Error fetching student logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Submit weekly review (INDUSTRY_SUPERVISOR) - Friday only
router.post('/review', authRequired, requireVerifiedSupervisor, requireRole('INDUSTRY_SUPERVISOR'), async (req, res) => {
  try {
    const { student_id, week_number, comment } = req.body;

    if (!student_id || !week_number) {
      return res.status(400).json({ error: 'Student ID and week number required' });
    }

    // Check if it's Friday
    const today = new Date();
    if (today.getDay() !== 5) { // 5 = Friday
      await logAudit(req.user.id, 'INDUSTRY_SUPERVISOR', 'REVIEW_ATTEMPT', 'weekly_review', false, req.ip);
      return res.status(403).json({ error: 'Reviews can only be submitted on Fridays' });
    }

    // Verify supervisor is assigned to this student
    const assignmentCheck = await pool.query(
      'SELECT id FROM student_supervisor_assignments WHERE student_id = $1 AND industry_supervisor_id = $2',
      [student_id, req.user.id]
    );

    if (!assignmentCheck.rows[0]) {
      await logAudit(req.user.id, 'INDUSTRY_SUPERVISOR', 'UNAUTHORIZED_ACCESS', `student_${student_id}`, false, req.ip);
      return res.status(403).json({ error: 'Not assigned to this student' });
    }

    // Check if review already exists
    const existingReview = await pool.query(
      'SELECT id FROM weekly_reviews WHERE student_id = $1 AND week_number = $2',
      [student_id, week_number]
    );

    if (existingReview.rows[0]) {
      await logAudit(req.user.id, 'INDUSTRY_SUPERVISOR', 'REVIEW_EDIT_ATTEMPT', 'weekly_review', false, req.ip);
      return res.status(403).json({ error: 'Week already reviewed and locked' });
    }

    // Generate review hash
    const reviewHash = generateHash({
      student_id,
      week_number,
      supervisor_id: req.user.id,
      comment,
      timestamp: new Date().toISOString()
    });

    // Create review
    const result = await pool.query(
      `INSERT INTO weekly_reviews (student_id, week_number, industry_supervisor_id, comment, review_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, reviewed_at`,
      [student_id, week_number, req.user.id, comment, reviewHash]
    );

    // Lock all log entries for this week
    await pool.query(
      `UPDATE log_entries SET status = 'LOCKED' WHERE student_id = $1 AND week_number = $2`,
      [student_id, week_number]
    );

    await logAudit(req.user.id, 'INDUSTRY_SUPERVISOR', 'WEEKLY_REVIEW', `week_${week_number}`, true, req.ip);
    res.status(201).json({ review: result.rows[0], message: 'Week reviewed and locked' });
  } catch (error) {
    console.error('Review submission error:', error);
    await logAudit(req.user.id, 'INDUSTRY_SUPERVISOR', 'WEEKLY_REVIEW', 'weekly_review', false, req.ip);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// Get all students (read-only for INSTITUTION_SUPERVISOR)
router.get('/all-students', authRequired, requireVerifiedSupervisor, requireRole('INSTITUTION_SUPERVISOR'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.matric_number, s.full_name, s.institution, s.department, 
              s.siwes_start_date, s.siwes_end_date, s.created_at
       FROM students s ORDER BY s.created_at DESC`
    );

    res.json({ students: result.rows });
  } catch (error) {
    console.error('Error fetching all students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Submit final inspection (INSTITUTION_SUPERVISOR)
router.post('/inspection', authRequired, requireVerifiedSupervisor, requireRole('INSTITUTION_SUPERVISOR'), async (req, res) => {
  try {
    const { student_id, inspection_notes, compliance_status } = req.body;

    if (!student_id || !compliance_status) {
      return res.status(400).json({ error: 'Student ID and compliance status required' });
    }

    // Check if SIWES has ended
    const studentResult = await pool.query(
      'SELECT siwes_end_date FROM students WHERE id = $1',
      [student_id]
    );

    if (!studentResult.rows[0]) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const endDate = new Date(studentResult.rows[0].siwes_end_date);
    const today = new Date();
    
    if (today < endDate) {
      await logAudit(req.user.id, 'INSTITUTION_SUPERVISOR', 'INSPECTION_ATTEMPT', 'final_inspection', false, req.ip);
      return res.status(403).json({ error: 'SIWES period has not ended' });
    }

    // Check if inspection already exists
    const existingInspection = await pool.query(
      'SELECT id FROM final_inspections WHERE student_id = $1',
      [student_id]
    );

    if (existingInspection.rows[0]) {
      await logAudit(req.user.id, 'INSTITUTION_SUPERVISOR', 'INSPECTION_EDIT_ATTEMPT', 'final_inspection', false, req.ip);
      return res.status(403).json({ error: 'Final inspection already completed' });
    }

    // Generate inspection hash
    const inspectionHash = generateHash({
      student_id,
      supervisor_id: req.user.id,
      inspection_notes,
      compliance_status,
      timestamp: new Date().toISOString()
    });

    // Create inspection
    const result = await pool.query(
      `INSERT INTO final_inspections (student_id, institution_supervisor_id, inspection_notes, compliance_status, inspection_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, inspected_at`,
      [student_id, req.user.id, inspection_notes, compliance_status, inspectionHash]
    );

    await logAudit(req.user.id, 'INSTITUTION_SUPERVISOR', 'FINAL_INSPECTION', `student_${student_id}`, true, req.ip);
    res.status(201).json({ inspection: result.rows[0] });
  } catch (error) {
    console.error('Inspection submission error:', error);
    await logAudit(req.user.id, 'INSTITUTION_SUPERVISOR', 'FINAL_INSPECTION', 'final_inspection', false, req.ip);
    res.status(500).json({ error: 'Failed to submit inspection' });
  }
});

export default router;

