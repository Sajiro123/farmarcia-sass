export const environment = {
  production: false,
  saasMasterApiUrl: 'http://localhost:8081/api/v1',
  masterApiUrl: 'http://localhost:8081/api/v1',
  farmaciaApiUrl: 'http://localhost:8082/api/v1',
  defaultTenantId: 'a0000000-0000-0000-0000-000000000001',
  defaultSubdomain: 'farmacia-medicare',
  defaultEmailDomain: '@medicare.com',
  
  // Conexión Directa a Supabase de Farmacia (Data Plane reactivado)
  useSupabaseDirect: true,
  supabaseUrl: 'https://nsrqkzgjouggdzxpxybp.supabase.co',
  supabaseAnonKey: 'sb_publishable_ImWQQbBmqMzGWw1t-9Z3AA_flpMw8Fe',
  supabaseJwksUrl: 'https://nsrqkzgjouggdzxpxybp.supabase.co/auth/v1/.well-known/jwks.json',

  // API Decolecta (SUNAT / Tipo de Cambio)
  decolectaApiUrl: 'https://api.decolecta.com/v1',
  decolectaToken: ''
};

