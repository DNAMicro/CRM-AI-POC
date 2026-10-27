"use client";

import { useState } from "react";
import type { InlineFormData, FormField } from "@/types/conversation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Save } from "lucide-react";

interface Props {
  data: InlineFormData;
}

const API_ENDPOINTS: Record<string, string> = {
  contact: "/api/contacts",
  deal: "/api/deals",
  activity: "/api/activities",
};

const ENTITY_LABELS: Record<string, string> = {
  contact: "Contact",
  deal: "Deal",
  activity: "Activity",
};

export function InlineForm({ data }: Props) {
  const { entityType, title, fields, mode = "create", entityId } = data;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.value || "";
    return init;
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setStatus("error");
        setErrorMsg(`${f.label} is required`);
        return;
      }
    }
    setStatus("submitting");
    setErrorMsg("");

    try {
      const payload: Record<string, unknown> = { ...values };
      if (entityType === "deal") {
        if (payload.value) payload.value = Number(payload.value);
        if (payload.probability) payload.probability = Number(payload.probability);
      }
      if (entityType === "contact" && typeof payload.tags === "string") {
        payload.tags = (payload.tags as string).split(",").map((t) => t.trim()).filter(Boolean);
      }

      const isEdit = mode === "edit" && entityId;
      const url = isEdit ? `${API_ENDPOINTS[entityType]}/${entityId}` : API_ENDPOINTS[entityType];
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to ${isEdit ? "update" : "save"}`);
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : `Failed to ${mode === "edit" ? "update" : "save"}`);
    }
  };

  if (status === "success") {
    return (
      <div className="my-4 glass-card rounded-xl p-5 border-emerald-300/40 dark:border-emerald-800/30 bg-emerald-50/30 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{ENTITY_LABELS[entityType]} {mode === "edit" ? "updated" : "saved"} successfully!</span>
            <p className="text-[12px] text-emerald-600 mt-0.5">
              {entityType === "contact" && `${values.firstName} ${values.lastName} at ${values.company}`}
              {entityType === "deal" && `${values.name} — ${values.company}`}
              {entityType === "activity" && `${values.type}: ${values.description?.slice(0, 60)}...`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 glass-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Badge variant="outline" className="text-[10px] capitalize">{entityType}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {fields.map((field) => (
          <FormFieldInput
            key={field.key}
            field={field}
            value={values[field.key] || ""}
            onChange={(v) => handleChange(field.key, v)}
            disabled={status === "submitting"}
          />
        ))}
      </div>

      {status === "error" && (
        <p className="text-[12px] text-red-600 mt-3 font-medium">{errorMsg}</p>
      )}

      <div className="flex gap-2 mt-5 pt-4 border-t border-border/30">
        <Button
          onClick={handleSubmit}
          disabled={status === "submitting"}
          size="sm"
          className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 gap-1.5 rounded-xl"
        >
          {status === "submitting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {status === "submitting"
            ? (mode === "edit" ? "Updating..." : "Saving...")
            : (mode === "edit" ? `Update ${ENTITY_LABELS[entityType]}` : `Save ${ENTITY_LABELS[entityType]}`)}
        </Button>
      </div>
    </div>
  );
}

function FormFieldInput({ field, value, onChange, disabled }: { field: FormField; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const baseClass = "w-full px-3 py-2.5 text-[13px] bg-background/80 border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:bg-muted/50 transition-all placeholder:text-muted-foreground/50";
  const isFullWidth = field.type === "textarea" || field.key === "description" || field.key === "name" || field.key === "email";

  return (
    <div className={isFullWidth ? "col-span-2" : ""}>
      <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {field.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={baseClass}>
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={field.placeholder} rows={3} className={baseClass + " resize-none"} />
      ) : (
        <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : "text"} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={field.placeholder} className={baseClass} />
      )}
    </div>
  );
}
