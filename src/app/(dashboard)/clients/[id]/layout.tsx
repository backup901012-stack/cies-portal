import { createServerSupabase } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ClientNav from '@/components/layout/ClientNav'

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabase()

  const { data: client } = await supabase
    .from('cies_clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  return (
    <div>
      <ClientNav
        clientId={client.id}
        clientName={client.name}
        clientCode={client.client_code}
      />
      {children}
    </div>
  )
}
