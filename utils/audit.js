import pool from '../config/database.js';

export const logAudit = async (actorId, actorRole, action, resource, success, ipAddress) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_role, action, resource, success, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, actorRole, action, resource, success, ipAddress || null]
    );
  } catch (error) {
    console.error('Audit logging error:', error);
    // Don't throw - audit logging should never break the main flow
  }
};

