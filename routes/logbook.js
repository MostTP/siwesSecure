import express from 'express';
import pool from '../config/database.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { generateHash } from '../utils/auth.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Calculate week number from SIWES start date
const getWeekNumber = async (studentId, entryDate) => {
  const studentResult = await pool.query(
    'SELECT siwes_start_date FROM students WHERE id = $1',
    [studentId]
  );

  if (!studentResult.rows[0] || !studentResult.rows[0].siwes_start_date) {
    return null;
  }

  const startDate = new Date(studentResult.rows[0].siwes_start_date);
  const entry = new Date(entryDate);
  const diffTime = entry - startDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;

  return weekNumber > 0 ? weekNumber : 1;
};

// Student: Create log entry
router.post('/', authRequired, requireRole('STUDENT'), async (req, res) => {
  try {
    const { activity_description, presence_log_id } = req.body;
    const studentId = req.user.id;

    if (!activity_description) {
      return res.status(400).json({ error: 'Activity description required' });
    }

    // Use server date (no backdating)
    const entryDate = new Date().toISOString().split('T')[0];
    const weekNumber = await getWeekNumber(studentId, entryDate);

    if (!weekNumber) {
      return res.status(400).json({ error: 'SIWES start date not set' });
    }

    // If presence_log_id provided, verify it's valid and belongs to student
    if (presence_log_id) {
      const presenceCheck = await pool.query(
        'SELECT id, status FROM presence_logs WHERE id = $1 AND student_id = $2',
        [presence_log_id, studentId]
      );

      if (!presenceCheck.rows[0]) {
        await logAudit(studentId, 'STUDENT', 'LOGBOOK_ATTEMPT', 'log_entry', false, req.ip);
        return res.status(400).json({ error: 'Invalid presence log' });
      }

      if (presenceCheck.rows[0].status !== 'VALID') {
        await logAudit(studentId, 'STUDENT', 'LOGBOOK_ATTEMPT', 'log_entry', false, req.ip);
        return res.status(400).json({ error: 'Presence must be VALID to create log entry' });
      }
    }

    // Check if entry already exists for today
    const existingCheck = await pool.query(
      'SELECT id, status FROM log_entries WHERE student_id = $1 AND entry_date = $2',
      [studentId, entryDate]
    );

    if (existingCheck.rows[0]) {
      if (existingCheck.rows[0].status === 'LOCKED') {
        await logAudit(studentId, 'STUDENT', 'LOGBOOK_EDIT_ATTEMPT', 'log_entry', false, req.ip);
        return res.status(403).json({ error: 'Entry is locked and cannot be modified' });
      }
      // Allow update if not locked
      const contentHash = generateHash({
        student_id: studentId,
        entry_date: entryDate,
        activity_description,
        timestamp: new Date().toISOString()
      });

      const result = await pool.query(
        `UPDATE log_entries 
         SET activity_description = $1, presence_log_id = $2, content_hash = $3
         WHERE id = $4 RETURNING *`,
        [activity_description, presence_log_id || null, contentHash, existingCheck.rows[0].id]
      );

      await logAudit(studentId, 'STUDENT', 'LOGBOOK_UPDATE', `log_entry_${result.rows[0].id}`, true, req.ip);
      return res.json({ log_entry: result.rows[0] });
    }

    // Create new entry
    const contentHash = generateHash({
      student_id: studentId,
      entry_date: entryDate,
      week_number: weekNumber,
      activity_description,
      timestamp: new Date().toISOString()
    });

    const result = await pool.query(
      `INSERT INTO log_entries (student_id, entry_date, week_number, activity_description, presence_log_id, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [studentId, entryDate, weekNumber, activity_description, presence_log_id || null, contentHash]
    );

    await logAudit(studentId, 'STUDENT', 'LOGBOOK_CREATE', `log_entry_${result.rows[0].id}`, true, req.ip);
    res.status(201).json({ log_entry: result.rows[0] });
  } catch (error) {
    console.error('Log entry creation error:', error);
    await logAudit(req.user.id, 'STUDENT', 'LOGBOOK_CREATE', 'log_entry', false, req.ip);
    res.status(500).json({ error: 'Failed to create log entry' });
  }
});

// Student: Get own log entries
router.get('/', authRequired, requireRole('STUDENT'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM log_entries WHERE student_id = $1 ORDER BY entry_date DESC`,
      [req.user.id]
    );

    res.json({ log_entries: result.rows });
  } catch (error) {
    console.error('Error fetching log entries:', error);
    res.status(500).json({ error: 'Failed to fetch log entries' });
  }
});

export default router;

