import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)

  await sql`
    CREATE TABLE IF NOT EXISTS vendor_roster_lists (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id uuid NOT NULL REFERENCES users(id),
      name text NOT NULL,
      owner_email text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `
  console.log('vendor_roster_lists created (or already existed)')

  // 每個目前有名單資料的廠商都先建一份「預設名單」，把既有資料掛進去
  const vendorsWithEntries = await sql`
    SELECT DISTINCT vendor_id FROM vendor_roster_entries
  `
  for (const row of vendorsWithEntries) {
    const vendorId = row.vendor_id as string
    const existing = await sql`SELECT id FROM vendor_roster_lists WHERE vendor_id = ${vendorId} LIMIT 1`
    const listId = existing.length > 0
      ? (existing[0].id as string)
      : ((await sql`INSERT INTO vendor_roster_lists (vendor_id, name) VALUES (${vendorId}, '預設名單') RETURNING id`)[0].id as string)
    console.log(`vendor ${vendorId} -> list ${listId}`)

    await sql`ALTER TABLE vendor_roster_entries ADD COLUMN IF NOT EXISTS list_id uuid REFERENCES vendor_roster_lists(id)`
    await sql`UPDATE vendor_roster_entries SET list_id = ${listId} WHERE vendor_id = ${vendorId} AND list_id IS NULL`
  }

  await sql`ALTER TABLE vendor_roster_entries ADD COLUMN IF NOT EXISTS list_id uuid REFERENCES vendor_roster_lists(id)`
  await sql`ALTER TABLE vendor_roster_entries ALTER COLUMN list_id SET NOT NULL`
  console.log('vendor_roster_entries.list_id backfilled and set NOT NULL')
}

main()
