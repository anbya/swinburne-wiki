# TODO: Implement Document Ingestion for Campus Wiki RAG

## Objective

Implement a complete document ingestion flow for the Campus Wiki RAG system.

When a user creates a new document from the UI:

1. Save the document metadata into `documents`
2. Split content into chunks
3. Generate embeddings for each chunk
4. Save chunks into `document_chunks`
5. Redirect user to document detail page

When a user creates or updates a wiki article from Wiki Management:

1. Keep the existing save flow to `wiki_pages`
2. After the wiki page is saved successfully, run the same ingestion flow
3. Split wiki content into chunks
4. Generate embeddings for each chunk
5. Save chunks into `document_chunks`

Important:

* Do not replace or remove the current save mechanism in Wiki Management
* Add embedding ingestion as an additional flow after the current wiki save succeeds

---

# Database Schema

## documents

```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE,

    source_type VARCHAR(50),
    source_url TEXT,

    category VARCHAR(100),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Example

```json
{
  "title": "Panduan KRS",
  "slug": "panduan-krs",
  "source_type": "manual",
  "category": "Akademik"
}
```

---

## document_chunks

```sql
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,

    content TEXT NOT NULL,

    metadata JSONB,

    embedding VECTOR(1536),

    created_at TIMESTAMP DEFAULT NOW()
);
```

### Example Metadata

```json
{
  "section": "Persyaratan KRS",
  "chunk": 1
}
```

---

# Create New Page

Create page:

```text
/app/documents/new/page.tsx
```

Features:

* Title input
* Category select
* Content textarea/editor
* Submit button

Form fields:

```typescript
{
  title: string;
  category: string;
  content: string;
}
```

---

# Create API Endpoint

Create route:

```text
/app/api/documents/route.ts
```

Method:

```http
POST /api/documents
```

Request:

```json
{
  "title": "Panduan KRS",
  "category": "Akademik",
  "content": "..."
}
```

Response:

```json
{
  "success": true,
  "documentId": "uuid"
}
```

---

# Service Layer

Create:

```text
/src/server/services/document.service.ts
```

Function:

```typescript
createDocument()
```

Responsibilities:

1. Insert into documents table
2. Chunk content
3. Generate embeddings
4. Insert into document_chunks
5. Return document id

This ingestion logic should be reusable so it can be triggered from:

* `/app/documents/new/page.tsx`
* existing Wiki Management save flow in `WikiManagementClient.tsx`

---

# Chunking Strategy

Create utility:

```text
/src/lib/rag/chunker.ts
```

Function:

```typescript
splitIntoChunks(content: string)
```

Rules:

* chunk size ≈ 1000 characters
* overlap ≈ 200 characters
* preserve paragraph boundaries whenever possible

Output:

```typescript
[
  {
    chunkIndex: 0,
    content: "..."
  }
]
```

---

# Embedding Service

Create:

```text
/src/lib/rag/embedding.ts
```

Function:

```typescript
generateEmbedding(text: string)
```

Return:

```typescript
number[]
```

Requirements:

* Use existing embedding provider configured in project
* Return vector length compatible with VECTOR(1536)

---

# Ingestion Flow

```text
User Submit Form
        │
        ▼
Create Document
        │
        ▼
Insert documents
        │
        ▼
Chunk Content
        │
        ▼
Generate Embeddings
        │
        ▼
Insert document_chunks
        │
        ▼
Return documentId
```

Additional Wiki Management flow:

```text
User Save Wiki Article
  │
  ▼
Existing Save to wiki_pages
  │
  ▼
Trigger RAG Ingestion
  │
  ▼
Chunk Content
  │
  ▼
Generate Embeddings
  │
  ▼
Insert document_chunks
```

---

# Pseudocode

```typescript
const document = await db.documents.create(...)

const chunks = splitIntoChunks(content)

for (const chunk of chunks) {
  const embedding = await generateEmbedding(chunk.content)

  await db.document_chunks.create({
    document_id: document.id,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    embedding
  })
}

return document.id
```

---

# Validation

Required:

* title
* category
* content

For Wiki Management ingestion:

* preserve current wiki save behavior
* embedding flow runs after successful save

Reject:

```text
empty title
empty category
empty content
```

---

# Success Criteria

* User can create a document from UI
* Document saved into `documents`
* Content automatically chunked
* Embeddings generated
* Chunks stored in `document_chunks`
* User redirected to document detail page
* Wiki Management still saves data the same way as before
* Wiki Management also triggers chunking + embedding after save
* Typescript passes
* ESLint passes

```
```
