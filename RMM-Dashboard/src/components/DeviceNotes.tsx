"use client";

import { useEffect, useState, useCallback } from "react";
import { StickyNote, Tag, Plus, Trash2, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Field { id: string; key: string; value: string }

export function DeviceNotes({ deviceId, initialNotes }: { deviceId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const [fields, setFields] = useState<Field[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const loadFields = useCallback(async () => {
    const res = await fetch(`/api/devices/${deviceId}/fields`);
    if (res.ok) setFields(await res.json());
  }, [deviceId]);

  useEffect(() => { loadFields(); }, [loadFields]);

  const saveNotes = useCallback(async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) setSavedNotes(notes);
    } finally { setSavingNotes(false); }
  }, [deviceId, notes]);

  const addField = useCallback(async () => {
    if (!newKey.trim()) return;
    const res = await fetch(`/api/devices/${deviceId}/fields`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: newKey.trim(), value: newVal }),
    });
    if (res.ok) { setNewKey(""); setNewVal(""); loadFields(); }
  }, [deviceId, newKey, newVal, loadFields]);

  const removeField = useCallback(async (key: string) => {
    await fetch(`/api/devices/${deviceId}/fields?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    loadFields();
  }, [deviceId, loadFields]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><StickyNote className="h-4 w-4 text-primary" /> Notes &amp; Custom Fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Notes */}
        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notes about this device (access details, owner, quirks)…"
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
          {notes !== savedNotes && (
            <div className="mt-2">
              <Button size="sm" className="h-7 text-xs gap-1" onClick={saveNotes} disabled={savingNotes}>
                {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save notes
              </Button>
            </div>
          )}
        </div>

        {/* Custom fields */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> Custom fields</p>
          {fields.length > 0 && (
            <div className="space-y-1 mb-2">
              {fields.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-sm border-t border-border/50 py-1">
                  <span className="font-medium min-w-[120px]">{f.key}</span>
                  <span className="text-muted-foreground flex-1 truncate">{f.value}</span>
                  <button onClick={() => removeField(f.key)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Field (e.g. Asset tag)"
              className="w-40 bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="Value" onKeyDown={(e) => e.key === "Enter" && addField()}
              className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={addField}><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
