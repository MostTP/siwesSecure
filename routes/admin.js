import express from 'express';
import pool from '../config/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Verify supervisor (ADMIN only)
router.post('/verify-supervisor', authRequired, requireRole('ADMIN'), async (req, res) => {
  try {
    const { supervisor_id, supervisor_type } = req.body;

    if (!supervisor_id || !supervisor_type) {
      return res.status(400).json({ error: 'Supervisor ID and type required' });
    }

    if (supervisor_type !== 'INDUSTRY_SUPERVISOR' && supervisor_type !== 'INSTITUTION_SUPERVISOR') {
      return res.status(400).json({ error: 'Invalid supervisor type' });
    }

    const table = supervisor_type === 'INDUSTRY_SUPERVISOR' ? 'industry_supervisors' : 'institution_supervisors';
    
    const result = await pool.query(
      `UPDATE ${table} SET verified = TRUE WHERE id = $1 RETURNING id, full_name, verified`,
      [supervisor_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Supervisor not found' });
    }

    await logAudit(req.user.id, 'ADMIN', 'VERIFY_SUPERVISOR', `${supervisor_type}_${supervisor_id}`, true, req.ip);
    res.json({ supervisor: result.rows[0] });
  } catch (error) {
    console.error('Supervisor verification error:', error);
    await logAudit(req.user.id, 'ADMIN', 'VERIFY_SUPERVISOR', 'supervisor', false, req.ip);
    res.status(500).json({ error: 'Failed to verify supervisor' });
  }
});

// Assign student to industry supervisor
router.post('/assign-supervisor', authRequired, requireRole('ADMIN'), async (req, res) => {
  try {
    const { student_id, industry_supervisor_id } = req.body;

    if (!student_id || !industry_supervisor_id) {
      return res.status(400).json({ error: 'Student ID and supervisor ID required' });
    }

    // Check if supervisor is verified
    const supervisorCheck = await pool.query(
      'SELECT id, verified FROM industry_supervisors WHERE id = $1',
      [industry_supervisor_id]
    );

    if (!supervisorCheck.rows[0]) {
      return res.status(404).json({ error: 'Supervisor not found' });
    }

    if (!supervisorCheck.rows[0].verified) {
      return res.status(400).json({ error: 'Supervisor must be verified before assignment' });
    }

    // Create or update assignment
    const result = await pool.query(
      `INSERT INTO student_supervisor_assignments (student_id, industry_supervisor_id)
       VALUES ($1, $2)
       ON CONFLICT (student_id, industry_supervisor_id) DO NOTHING
       RETURNING *`,
      [student_id, industry_supervisor_id]
    );

    if (!result.rows[0]) {
      return res.status(400).json({ error: 'Assignment already exists' });
    }

    await logAudit(req.user.id, 'ADMIN', 'ASSIGN_SUPERVISOR', `student_${student_id}`, true, req.ip);
    res.status(201).json({ assignment: result.rows[0] });
  } catch (error) {
    console.error('Assignment error:', error);
    await logAudit(req.user.id, 'ADMIN', 'ASSIGN_SUPERVISOR', 'assignment', false, req.ip);
    res.status(500).json({ error: 'Failed to assign supervisor' });
  }
});

// Assign student to company location
router.post('/assign-location', authRequired, requireRole('ADMIN'), async (req, res) => {
  try {
    const { student_id, company_location_id } = req.body;

    if (!student_id || !company_location_id) {
      return res.status(400).json({ error: 'Student ID and location ID required' });
    }

    const result = await pool.query(
      `UPDATE students SET company_location_id = $1 WHERE id = $2 RETURNING id, company_location_id`,
      [company_location_id, student_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Student not found' });
    }

    await logAudit(req.user.id, 'ADMIN', 'ASSIGN_LOCATION', `student_${student_id}`, true, req.ip);
    res.json({ student: result.rows[0] });
  } catch (error) {
    console.error('Location assignment error:', error);
    await logAudit(req.user.id, 'ADMIN', 'ASSIGN_LOCATION', 'assignment', false, req.ip);
    res.status(500).json({ error: 'Failed to assign location' });
  }
});

// Get all audit logs
router.get('/audit-logs', authRequired, requireRole('ADMIN'), async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) FROM audit_logs');

    res.json({
      audit_logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get all students with details
router.get('/students', authRequired, requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, cl.company_name, cl.latitude, cl.longitude
       FROM students s
       LEFT JOIN company_locations cl ON s.company_location_id = cl.id
       ORDER BY s.created_at DESC`
    );

    res.json({ students: result.rows });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get all supervisors
router.get('/supervisors', authRequired, requireRole('ADMIN'), async (req, res) => {
  try {
    const industryResult = await pool.query('SELECT * FROM industry_supervisors ORDER BY created_at DESC');
    const institutionResult = await pool.query('SELECT * FROM institution_supervisors ORDER BY created_at DESC');

    res.json({
      industry_supervisors: industryResult.rows,
      institution_supervisors: institutionResult.rows
    });
  } catch (error) {
    console.error('Error fetching supervisors:', error);
    res.status(500).json({ error: 'Failed to fetch supervisors' });
  }
});

export default router;

