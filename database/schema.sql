-- SIWESecure Database Schema

-- Students
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matric_number VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  institution VARCHAR(255),
  department VARCHAR(255),
  siwes_start_date DATE,
  siwes_end_date DATE,
  company_location_id UUID,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Industry Supervisors
CREATE TABLE IF NOT EXISTS industry_supervisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  official_email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  signature_url TEXT,
  stamp_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Institution Supervisors
CREATE TABLE IF NOT EXISTS institution_supervisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  institution VARCHAR(255) NOT NULL,
  staff_id VARCHAR(100) UNIQUE NOT NULL,
  official_email VARCHAR(255) UNIQUE NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role_level VARCHAR(50),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company Locations
CREATE TABLE IF NOT EXISTS company_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  allowed_radius_meters INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Presence Logs
CREATE TABLE IF NOT EXISTS presence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  distance_m DECIMAL(10, 2),
  status VARCHAR(20) NOT NULL CHECK (status IN ('VALID', 'INVALID')),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Log Entries
CREATE TABLE IF NOT EXISTS log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  week_number INTEGER NOT NULL,
  activity_description TEXT NOT NULL,
  presence_log_id UUID REFERENCES presence_logs(id),
  content_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'LOCKED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weekly Reviews
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  industry_supervisor_id UUID NOT NULL REFERENCES industry_supervisors(id) ON DELETE CASCADE,
  comment TEXT,
  signature_url TEXT,
  stamp_url TEXT,
  review_hash VARCHAR(64) NOT NULL,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, week_number)
);

-- Final Inspections
CREATE TABLE IF NOT EXISTS final_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  institution_supervisor_id UUID NOT NULL REFERENCES institution_supervisors(id) ON DELETE CASCADE,
  inspection_notes TEXT,
  compliance_status VARCHAR(50) NOT NULL,
  inspection_hash VARCHAR(64) NOT NULL,
  inspected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(255),
  success BOOLEAN NOT NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student-Supervisor Assignments
CREATE TABLE IF NOT EXISTS student_supervisor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  industry_supervisor_id UUID NOT NULL REFERENCES industry_supervisors(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, industry_supervisor_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_presence_logs_student_id ON presence_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_log_entries_student_id ON log_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_log_entries_week ON log_entries(student_id, week_number);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_student_week ON weekly_reviews(student_id, week_number);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, actor_role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

