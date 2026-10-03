#!/bin/sh
# First start of an empty database: the application gets its own role without superuser
# rights, owning only its database.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE lingvohero_app LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE lingvohero OWNER lingvohero_app;
SQL
