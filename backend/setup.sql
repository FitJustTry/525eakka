CREATE DATABASE ekarat_capacity;

CREATE USER ekarat_user WITH PASSWORD 'change_this_password';

GRANT ALL PRIVILEGES ON DATABASE ekarat_capacity TO ekarat_user;

\connect ekarat_capacity

GRANT ALL ON SCHEMA public TO ekarat_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ekarat_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ekarat_user;
