process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://golias:golias@localhost:5432/golias_test?schema=public";
