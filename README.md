# Help & Support API (Cursor-based pagination)

This module adds a production-ready Help & Support API with cursor-based pagination using Node.js, Express, and MongoDB (Mongoose v6+).

## Features
- JWT-protected endpoints (assumes `req.user` contains `{ id, role }` from existing middleware)
- Cursor-based pagination via Base64 token encoding `{ createdAt, _id }`
- Tickets, messages, and attachments collections with indexes
- Atomic ticketNumber generation using `counters` collection
- S3-compatible file uploads (GridFS fallback available upon request)

## Environment
Set the following environment variables:

- `JWT_SECRET` (already used by existing auth)
- `MONGODB_URI`
- `S3_ENDPOINT` (e.g., `https://s3.amazonaws.com` or MinIO endpoint)
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` (optional, defaults to `${S3_ENDPOINT}/${S3_BUCKET}`)

## Models
- `SupportTicket`: `_id, ticketNumber, userId, subject, contactType, status, assigneeId, createdAt, updatedAt`
- `SupportMessage`: `_id, ticketId, senderId, message, attachments[], createdAt`
- `SupportAttachment`: `_id, ticketId, messageId, fileName, fileUrl, fileSize, contentType, uploadedBy, createdAt`
- `counters`: `{ _id: 'ticketNumber', seq: Number }`

## Cursor token
Base64 URL-safe token encoding JSON: `{ createdAt, _id }`. Example decode:

```bash
node -e 'const b=process.argv[1];let s=b.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";console.log(Buffer.from(s,"base64").toString("utf8"))' eyJjcmVhdGVkQXQiOiIyMDI1LTEwLTI3VDEyOjAwOjAwLjAwMFoiLCJfaWQiOiI2NzJhYWEwMDAwMDAwMDAwMDAwMDAwMCJ9
```

## Routes
Mounted at `/api/support` in `src/app.js`.

- POST `/tickets`
- GET `/tickets`
- GET `/tickets/:ticketId`
- GET `/tickets/:ticketId/messages`
- POST `/tickets/:ticketId/messages`
- PATCH `/tickets/:ticketId/status`
- POST `/attachments` (multipart/form-data, field `file`)

## Role access
- `User`: can access own tickets only
- `Agent|Manager|Admin`: can access all tickets (extend scoping as needed)

## cURL examples
Assume `TOKEN` is a valid Bearer token.

Create ticket:
```bash
curl -s -X POST http://localhost:5000/api/support/tickets \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"subject":"Cannot login","contactType":"app","message":"Please help"}'
```

List tickets (first page):
```bash
curl -s -G http://localhost:5000/api/support/tickets \
 -H "Authorization: Bearer $TOKEN" --data-urlencode "limit=20"
```

List tickets (with cursor):
```bash
curl -s -G http://localhost:5000/api/support/tickets \
 -H "Authorization: Bearer $TOKEN" --data-urlencode "cursor=BASE64_TOKEN"
```

Get ticket with latest messages:
```bash
curl -s -G http://localhost:5000/api/support/tickets/TICKET_ID \
 -H "Authorization: Bearer $TOKEN" --data-urlencode "limit=20"
```

List messages for a ticket:
```bash
curl -s -G http://localhost:5000/api/support/tickets/TICKET_ID/messages \
 -H "Authorization: Bearer $TOKEN" --data-urlencode "limit=50"
```

Post a message:
```bash
curl -s -X POST http://localhost:5000/api/support/tickets/TICKET_ID/messages \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"message":"Here\'s more detail"}'
```

Update status (staff only):
```bash
curl -s -X PATCH http://localhost:5000/api/support/tickets/TICKET_ID/status \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"status":"resolved"}'
```

Upload attachment:
```bash
curl -s -X POST http://localhost:5000/api/support/attachments \
 -H "Authorization: Bearer $TOKEN" \
 -F file=@/path/to/file.pdf
```

Create ticket with pre-uploaded attachments:
```bash
curl -s -X POST http://localhost:5000/api/support/tickets \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"subject":"Issue","attachments":[{"fileName":"file.pdf","fileUrl":"https://...","fileSize":12345,"contentType":"application/pdf"}]}'
```

## Seed script (optional)
From a Node REPL or a script, you can create a test user and seed a ticket. Ensure DB is connected and `req.user` is available during requests.

## Notes
- Attachment uploads are stored in S3-compatible storage. For GridFS fallback, implement an alternative `uploadToGridFS` in `utils/support/storage.js` and wire via env flag.
- Indexes are defined for recency queries and cursor pagination. Use `createdAt` + `_id` for stable ordering.
- `totalCount` is intentionally omitted to avoid expensive counts on large collections.
