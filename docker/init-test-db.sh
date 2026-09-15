#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "" --dbname "" <<-EOSQL
    CREATE DATABASE atlas_test;
    GRANT ALL PRIVILEGES ON DATABASE atlas_test TO ;
EOSQL
