# Auth-Gated App Testing Playbook (Emergent Google Auth)

App specifics: DB name from /app/backend/.env (`apextrade_db`). Users are keyed by MongoDB `_id` (ObjectId);
`user_sessions.user_id` stores `str(user._id)`. Cookie name for Google sessions: `session_token`.
Existing email/password JWT flow still works (cookie `access_token` or Bearer JWT).

## Step 1: Create Test User & Session
mongosh --eval "
use('apextrade_db');
var u = db.users.insertOne({
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User', picture: 'https://via.placeholder.com/150',
  role: 'user', auth_provider: 'google',
  cash_balance: 100000, starting_balance: 100000, created_at: new Date()
});
var sessionToken = 'test_session_' + Date.now();
db.user_sessions.insertOne({
  user_id: u.insertedId.toString(),
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
"

## Step 2: Test Backend API
curl -X GET "$API_URL/api/auth/me" -H "Authorization: Bearer SESSION_TOKEN"
curl -X GET "$API_URL/api/portfolio" -H "Authorization: Bearer SESSION_TOKEN"
curl -X GET "$API_URL/api/auth/me" -H "Cookie: session_token=SESSION_TOKEN"

## Step 3: Browser Testing
await page.context.add_cookies([{
  "name": "session_token", "value": "SESSION_TOKEN",
  "domain": "<preview host>", "path": "/", "httpOnly": true, "secure": true, "sameSite": "None"
}]);
await page.goto("<preview url>/");  // should land on dashboard, not /login

## Google flow (cannot be automated end-to-end)
- Click "Continue with Google" (`data-testid="google-login-btn"`) -> redirects to https://auth.emergentagent.com/?redirect=<origin>/
- Callback lands at `<origin>/#session_id=...`; frontend POSTs `/api/auth/google/session` `{session_id}`.

## Clean test data
mongosh --eval "
use('apextrade_db');
db.users.deleteMany({email: /test\.user\./});
db.user_sessions.deleteMany({session_token: /test_session/});
"

## Checklist
- /api/auth/me returns user with session_token (cookie or Bearer)
- Dashboard loads without redirect when session_token cookie set
- Logout deletes the session doc and clears cookies
- Email/password login still works (admin@apextrade.com / admin123)
