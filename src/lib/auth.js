// Il login avviene con uno username. Internamente lo mappiamo su una email
// sintetica "<username>@gestionecasa.app" (mai mostrata all'utente), perche
// Supabase Auth lavora con le email. Il dominio deve combaciare con quello
// usato nella Edge Function "admin-users".
export const USERNAME_DOMAIN = 'gestionecasa.app'

export function usernameToEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@${USERNAME_DOMAIN}`
}
