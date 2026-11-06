import { useParams } from 'react-router'

import { SheetWorkbench } from '@/features/cad/SheetWorkbench'

export default function SheetRoute() {
  const { sheetId = '' } = useParams()
  return <SheetWorkbench key={sheetId} sheetId={sheetId} />
}
