import pg from 'pg';
/*
This script creates 100 partitions
and attaches them to the main table customers
*/
async function run() {
  try {
    const dbClientPostgres = new pg.Client({
      user: 'postgres',
      password: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
    });

    console.log('connecting to postgres...');
    await dbClientPostgres.connect();
    console.log('creating database customers...');
    await dbClientPostgres.query('create database customers');

    const dbClientCustomers = new pg.Client({
      user: 'postgres',
      password: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'customers',
    });

    console.log('connecting to customers db...');
    await dbClientCustomers.connect();
    console.log('creating customers table...');
    const sql = `create table customers (id serial, name text)
                  partition by range (id)`;
    await dbClientCustomers.query(sql);
    console.log('creating partitions...');
    /*
    assume we are going to support 1B customers
    and each partition will have 10M customers
    that gives 1000/10 -> 100 partition tables
    */
    for (let i = 0; i < 100; i++) {
      const idFrom = i * 10000000 + 1;
      const idTo = (i + 1) * 10000000 + 1;
      const partitionName = `customers_${idFrom}_${idTo - 1}`;
      const psql1 = `create table ${partitionName}
                      (like customers including indexes)`;

      const psql2 = `alter table customers
                      attach partition ${partitionName}
                      for values from (${idFrom}) to (${idTo})`;

      console.log(`creating partition ${partitionName}...`);
      await dbClientCustomers.query(psql1);
      await dbClientCustomers.query(psql2);
    }

    console.log('closing connection...');
    await dbClientCustomers.end();
    await dbClientPostgres.end();
    console.log('done.');
  } catch (ex) {
    console.error(`something went wrong ${JSON.stringify(ex)}`);
  }
}

run();
