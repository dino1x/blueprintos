import { actionErrorMessage, useActionMutation } from '@agent-native/core/client/hooks'
import { IconRestore } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// Restores the drawing register to its baseline A-101 and A-201 floorplans.
// Restricted to human architects via uiOnly on the underlying action.
export function RestoreRegisterModal({ className = '' }: { className?: string }): React.ReactElement {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const restore = useActionMutation('reset-demo', {
    onSuccess: async (_res, vars) => {
      await queryClient.invalidateQueries()
      toast.success(
        vars?.keepLearnedRules
          ? 'Register restored with learned spatial rules preserved.'
          : 'Drawing register restored to baseline sheets (A-101 & A-201).',
      )
    },
    onError: (err) => toast.error(actionErrorMessage(err) ?? 'Could not restore drawing register.'),
  })
  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={restore.isPending}
        className={`inline-flex items-center gap-1.5 ${className}`}
      >
        <IconRestore className="size-4" /> {restore.isPending ? 'Restoring…' : 'Reset demo'}
      </button>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore baseline drawing register?</AlertDialogTitle>
            <AlertDialogDescription>
              Clears active clearance receipts, staged redline proposals, architect seals, and manual vertex edits across A-101 and A-201. You may optionally retain learned spatial conventions for the next audit run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-transparent text-foreground border border-border hover:bg-accent"
              onClick={() => restore.mutate({ keepLearnedRules: true })}
            >
              Reset, keep learned rules
            </AlertDialogAction>
            <AlertDialogAction onClick={() => restore.mutate({})}>Reset everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
