import { Outlet } from 'react-router'

export function meta() {
  return [{ title: 'Drawing register · BlueprintOS' }]
}

export default function SheetsLayout() {
  return <Outlet />
}
