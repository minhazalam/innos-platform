import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const questions = ["What needs my attention today?", "How many arrivals are there today?", "Which rooms need attention?", "Which payments are pending?"];

export default function AIManager() {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState([]);
  const ask = useMutation({
    mutationFn: (text) => api.post("/ai/ask", { question: text }),
    onSuccess: ({ data }, text) => { setAnswers((current) => [...current, { question: text, ...data }]); setQuestion(""); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });
  const submit = (text = question) => { if (text.trim()) ask.mutate(text.trim()); };
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={user.role === "front_desk" ? "AI Assistant" : "AI Manager"} subtitle="Ask questions about current hotel operations." />
      <Card className="rounded-2xl border-primary/20 bg-primary/5 p-5 sm:p-6">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5" /></div><div><h2 className="font-semibold">A grounded view of your hotel</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Answers are based on current Innos records. The assistant cannot change bookings, rates, or payments.</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{questions.map((item) => <Button key={item} variant="outline" size="sm" className="h-auto whitespace-normal rounded-full bg-background py-2 text-left" onClick={() => submit(item)} disabled={ask.isPending}>{item}</Button>)}</div>
      </Card>
      {answers.map((item, index) => <div key={`${index}-${item.question}`} className="space-y-3">
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">{item.question}</div>
        <Card className="flex gap-3 rounded-2xl border-border p-4 sm:p-5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="whitespace-pre-wrap text-sm leading-relaxed">{item.answer}</p><div className="mt-3 text-xs text-muted-foreground">Hotel data as of {item.facts?.date || "today"}{item.provider_used ? " · AI answer" : " · Data-backed quick answer"}{item.provider_error ? " · Provider unavailable; showing a data-backed fallback" : ""}</div></div></Card>
      </div>)}
      <Card className="rounded-2xl border-border p-3 sm:p-4">
        <div className="flex items-end gap-3"><Textarea value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} rows={2} placeholder="Ask about occupancy, arrivals, payments or issues…" className="min-h-12 resize-none border-0 shadow-none focus-visible:ring-0" /><Button size="icon" className="h-11 w-11 shrink-0 rounded-xl" disabled={!question.trim() || ask.isPending} onClick={() => submit()} aria-label="Send question"><Send className="h-4 w-4" /></Button></div>
      </Card>
      <p className="text-center text-xs text-muted-foreground">Open-ended answers require an OpenAI-compatible provider configured on the backend. Core operations work without it.</p>
    </div>
  );
}
