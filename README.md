# SIWESecure Backend

Secure, auditable SIWES (Student Industrial Work Experience Scheme) management system with GPS presence validation and dual-supervisor oversight.

## Features

- **Role-based Authentication**: JWT-based auth with 4 roles (Student, Industry Supervisor, Institution Supervisor, Admin)
- **GPS Presence Validation**: Server-side validation prevents location spoofing
- **Immutable Logbook**: Once reviewed, entries are locked forever
- **Audit Logging**: All actions are logged for forensic analysis
- **Authority Separation**: No role can approve its own oversight

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up PostgreSQL database and run schema:
```bash
psql -U postgres -d siwesecure -f database/schema.sql
```

3. Create `.env` file:
```
DB_USER=postgres
DB_HOST=localhost
DB_NAME=siwesecure
DB_PASSWORD=your_password
DB_PORT=5432
JWT_SECRET=your_secret_key
PORT=3000
```

4. Start server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register/student` - Register student
- `POST /api/auth/register/supervisor` - Register supervisor
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Locations (Admin)
- `POST /api/locations` - Create company location
- `GET /api/locations` - Get all locations

### Presence (Student)
- `POST /api/presence` - Submit GPS presence
- `GET /api/presence/history` - Get presence history

### Logbook (Student)
- `POST /api/logbook` - Create/update log entry
- `GET /api/logbook` - Get own log entries

### Supervisor
- `GET /api/supervisor/students` - Get assigned students (Industry)
- `GET /api/supervisor/students/:id/logs` - Get student logs
- `POST /api/supervisor/review` - Submit weekly review (Friday only)
- `GET /api/supervisor/all-students` - Get all students (Institution)
- `POST /api/supervisor/inspection` - Submit final inspection

### Admin
- `POST /api/admin/verify-supervisor` - Verify supervisor
- `POST /api/admin/assign-supervisor` - Assign student to supervisor
- `POST /api/admin/assign-location` - Assign student to location
- `GET /api/admin/audit-logs` - Get audit logs
- `GET /api/admin/students` - Get all students
- `GET /api/admin/supervisors` - Get all supervisors

## Security Features

- All GPS validation done server-side
- JWT tokens with role verification
- Supervisor verification required before access
- Immutable reviews (Friday-only, locks entries)
- Content hashing for log entries
- Comprehensive audit logging
- No backdating allowed (server date enforced)

