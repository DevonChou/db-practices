#!/bin/bash

mv rep/pgstandby_data rep/pgstandby_data_bk

cp -R rep/pgmaster_data rep/pgstandby_data

echo "host replication postgres all md5" >> rep/pgmaster_data/pg_hba.conf

primary_conninfo_config="primary_conninfo = 'application_name=standby1 host=pgmaster port=5432 user=postgres password=postgres'"

sed -i "s|#primary_conninfo = ''\(.*\)|$primary_conninfo_config\1|" rep/pgstandby_data/postgresql.conf

touch rep/pgstandby_data/standby.signal

synchronous_standby_names_config="synchronous_standby_names = 'first 1 (standby1)'"

sed -i "s|#synchronous_standby_names = ''\(.*\)|$synchronous_standby_names_config\1|" rep/pgmaster_data/postgresql.conf
