"use client";

import { useState } from "react";
import { Button, Dialog, Inline, Input, useDialog, useToast, type ToastTone } from "@/components/admin/ui";

/** Dialog examples: a confirmation and a small form. Nothing is saved. */
export function DialogDemo() {
  const confirm = useDialog();
  const form = useDialog();
  return (
    <Inline gap={2}>
      <Button onClick={confirm.show}>Abrir confirmación</Button>
      <Button onClick={form.show}>Abrir diálogo con formulario</Button>
      <Dialog
        {...confirm.props}
        size="sm"
        title="¿Eliminar el registro de ejemplo?"
        description="Es solo una demostración: no se elimina nada."
        actions={
          <>
            <Button onClick={confirm.close}>Cancelar</Button>
            <Button variant="critical" onClick={confirm.close}>
              Eliminar
            </Button>
          </>
        }
      />
      <Dialog
        {...form.props}
        title="Editar nombre (ejemplo)"
        description="Los cambios de este diálogo no se guardan."
        actions={
          <>
            <Button onClick={form.close}>Cancelar</Button>
            <Button variant="primary" onClick={form.close}>
              Guardar
            </Button>
          </>
        }
      >
        <Input label="Nombre" defaultValue="Ejemplo · Taza blanca" hint="Visible en la tienda." />
      </Dialog>
    </Inline>
  );
}

const SAMPLES: { tone: ToastTone; label: string; message: string }[] = [
  { tone: "info", label: "Informativa", message: "Ejemplo: la importación empezó." },
  { tone: "success", label: "Éxito", message: "Ejemplo: cambios guardados." },
  { tone: "warning", label: "Advertencia", message: "Ejemplo: quedan pocas unidades." },
  { tone: "critical", label: "Error", message: "Ejemplo: no se pudo guardar. Se queda hasta cerrarla." },
];

/** Toast examples, shown through the admin shell's ToastProvider. */
export function ToastDemo() {
  const toast = useToast();
  return (
    <Inline gap={2}>
      {SAMPLES.map((sample) => (
        <Button key={sample.tone} onClick={() => toast.show(sample.message, { tone: sample.tone })}>
          {sample.label}
        </Button>
      ))}
    </Inline>
  );
}

/** Button that shows its loading state for 2 s after a click. Nothing is saved. */
export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="primary"
      loading={loading}
      onClick={() => {
        setLoading(true);
        window.setTimeout(() => setLoading(false), 2000);
      }}
    >
      Guardar (ejemplo de carga)
    </Button>
  );
}
