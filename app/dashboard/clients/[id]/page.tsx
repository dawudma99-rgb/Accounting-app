import { notFound } from 'next/navigation'
import { getClient } from '../../actions'
import { ClientDetailView } from '../../components/ClientDetailView'

export default async function ClientDetailPage(props: PageProps<'/dashboard/clients/[id]'>) {
  const { id } = await props.params
  const client = await getClient(id)
  if (!client) notFound()
  return <ClientDetailView client={client} />
}
