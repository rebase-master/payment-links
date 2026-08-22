process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://payment_links:payment_links@localhost:5442/payment_links';
