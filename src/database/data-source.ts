import 'dotenv/config';
import { DataSource } from 'typeorm';

const isTsNode = !!(process[Symbol.for('ts-node.register.instance')] || process.env.TS_NODE_DEV);

const AppDataSource = new DataSource({
  type: 'postgres',

  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),

  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  entities: isTsNode ? ['src/**/*.entity.ts', 'dist/**/*.entity.js'] : ['dist/**/*.entity.js'],
  migrations: isTsNode ? ['src/database/migrations/*.ts', 'dist/database/migrations/*.js'] : ['dist/database/migrations/*.js'],

  synchronize: false,
});

export default AppDataSource;