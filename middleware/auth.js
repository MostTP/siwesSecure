import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

export const authRequired = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists in database
    const role = decoded.role;
    let user;
    
    switch (role) {
      case 'STUDENT':
        user = await pool.query('SELECT id, matric_number FROM students WHERE id = $1', [decoded.id]);
        break;
      case 'INDUSTRY_SUPERVISOR':
        user = await pool.query('SELECT id, verified FROM industry_supervisors WHERE id = $1', [decoded.id]);
        break;
      case 'INSTITUTION_SUPERVISOR':
        user = await pool.query('SELECT id, verified FROM institution_supervisors WHERE id = $1', [decoded.id]);
        break;
      case 'ADMIN':
        user = await pool.query('SELECT id FROM admins WHERE id = $1', [decoded.id]);
        break;
      default:
        return res.status(401).json({ error: 'Invalid role' });
    }

    if (!user.rows[0]) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      verified: user.rows[0].verified || true
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireVerifiedSupervisor = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const role = req.user.role;
  
  if (role !== 'INDUSTRY_SUPERVISOR' && role !== 'INSTITUTION_SUPERVISOR') {
    return next(); // Not a supervisor, skip this check
  }

  if (!req.user.verified) {
    return res.status(403).json({ error: 'Supervisor not verified' });
  }

  next();
};

