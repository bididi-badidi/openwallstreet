"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { destinations } from "../lib/examples";
import {
  receptionResultSchema,
  type ReceptionReply,
} from "../lib/reception-contract";
import { z } from "zod";
import { Arrow } from "./SiteChrome";
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: ReceptionReply;
};
const greeting =
  "Hi, welcome to OpenWallstreet. I can explain the project, help you explore a report, or create a research access code.";
async function api(action: string, body: unknown) {
  const response = await fetch(`/api/reception/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const data = z.record(z.string(), z.unknown()).parse(await response.json());
  if (!response.ok)
    throw Error(
      typeof data.error === "string"
        ? data.error
        : "Reception is temporarily unavailable.",
    );
  return data;
}
function ContactForm({
  ready,
  onCancel,
}: {
  ready: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const id = useRef(crypto.randomUUID());
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || sent) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await ready();
      const result = await api("contact", {
        id: id.current,
        name: form.get("name"),
        email: form.get("email"),
        subject: form.get("subject"),
        message: form.get("message"),
        confirmed: true,
      });
      if (!result.sent) throw Error("Delivery could not be confirmed.");
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <div className="contact-success" role="status">
        <strong>Message accepted for delivery.</strong>
        <p>It is on its way to contact@zishenchan.com.</p>
        <button type="button" onClick={onCancel}>
          Back to reception
        </button>
      </div>
    );
  return (
    <form className="contact-form" onSubmit={send}>
      <div className="contact-form-title">
        <strong>Contact Zishen</strong>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close contact form"
        >
          ×
        </button>
      </div>
      <p>
        Review your message. It will only be sent to{" "}
        <a href="mailto:contact@zishenchan.com">contact@zishenchan.com</a>.
      </p>
      <label>
        Your name
        <input name="name" maxLength={80} required disabled={busy} />
      </label>
      <label>
        Your email
        <input
          type="email"
          name="email"
          maxLength={200}
          required
          disabled={busy}
        />
      </label>
      <label>
        Subject
        <input
          name="subject"
          minLength={3}
          maxLength={120}
          required
          disabled={busy}
        />
      </label>
      <label>
        Message
        <textarea
          name="message"
          minLength={10}
          maxLength={3000}
          rows={4}
          required
          disabled={busy}
        />
      </label>
      {error && (
        <p role="alert" className="chat-error">
          {error}
        </p>
      )}
      <button className="contact-send" type="submit" disabled={busy}>
        {busy ? "Sending..." : "Send message"}
        <Arrow />
      </button>
      <small>
        Pressing Send message confirms the contents above. Please leave out
        passwords and sensitive financial information.
      </small>
    </form>
  );
}
export function Reception({
  open,
  onOpenChange,
  onAccessCode,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onAccessCode: (code: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "greeting", role: "assistant", text: greeting },
  ]);
  const [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [contact, setContact] = useState(false);
  const [issued, setIssued] = useState(false),
    [copied, setCopied] = useState(false);
  const boot = useRef<Promise<void> | null>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    log = useRef<HTMLDivElement>(null),
    opener = useRef<HTMLElement | null>(null);
  function ready() {
    if (!boot.current)
      boot.current = api("session", {})
        .then(() => undefined)
        .catch((e) => {
          boot.current = null;
          throw e;
        });
    return boot.current;
  }
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement;
      ready().catch(() => {});
      composer.current?.focus();
    } else opener.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open && log.current)
      log.current.scrollTop = contact ? 0 : log.current.scrollHeight;
  }, [messages, busy, contact, open]);
  async function request(action: "chat" | "code", message?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setCopied(false);
    if (message)
      setMessages((old) => [
        ...old,
        { id: crypto.randomUUID(), role: "user", text: message },
      ]);
    try {
      await ready();
      const result = receptionResultSchema.parse(
        await api(
          action,
          action === "chat" ? { id: crypto.randomUUID(), message } : {},
        ),
      );
      setMessages((old) => [
        ...old,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.reply,
          result,
        },
      ]);
      if (result.code) {
        setIssued(true);
        onAccessCode(result.code);
      }
      if (result.action === "contact") setContact(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reception could not answer.");
    } finally {
      setBusy(false);
      composer.current?.focus();
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    request("chat", message);
  }
  return (
    <aside className="reception" aria-label="OpenWallstreet reception">
      {!open && (
        <button
          className="reception-launcher"
          onClick={() => onOpenChange(true)}
          aria-expanded={false}
          aria-controls="reception-panel"
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z" />
            <path d="M7 9h10M7 13h6" />
          </svg>
          Ask reception
        </button>
      )}
      {open && (
        <section
          id="reception-panel"
          className="reception-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="reception-heading"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onOpenChange(false);
            }
          }}
        >
          <header className="reception-header">
            <h2 id="reception-heading">Reception</h2>
            <button
              aria-label="Close reception"
              onClick={() => onOpenChange(false)}
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          <div
            className="chat-log"
            ref={log}
            role="log"
            aria-label="Reception messages"
            aria-live="polite"
          >
            {!contact &&
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-message ${message.role}`}
                >
                  <p>{message.text}</p>
                  {message.result?.code && (
                    <div className="access-code-result">
                      <code>{message.result.code}</code>
                      <small>
                        {message.result.remainingUses} research uses remaining ·
                        expires 24 hours after issue
                      </small>
                      <button
                        onClick={() => {
                          onAccessCode(message.result!.code!);
                          opener.current =
                            document.getElementById("research-access");
                          onOpenChange(false);
                        }}
                      >
                        Use in research form <Arrow />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              message.result!.code!,
                            );
                            setCopied(true);
                          } catch {
                            setError(
                              "Copy is unavailable. Select the code above to copy it.",
                            );
                          }
                        }}
                      >
                        {copied ? "Copied" : "Copy code"}
                      </button>
                    </div>
                  )}
                  {message.result?.action === "navigate" &&
                    message.result.destination && (
                      <a
                        className="chat-navigation"
                        href={destinations[message.result.destination]}
                      >
                        Open{" "}
                        {message.result.destination === "home"
                          ? "homepage"
                          : message.result.destination}{" "}
                        <Arrow />
                      </a>
                    )}
                </div>
              ))}
            {!contact && busy && (
              <p className="chat-thinking" role="status">
                Reception is thinking...
              </p>
            )}
            {contact && (
              <ContactForm ready={ready} onCancel={() => setContact(false)} />
            )}
          </div>
          {!contact && (
            <div className="chat-quick-actions">
              <button
                disabled={busy}
                onClick={() =>
                  request(
                    "code",
                    issued
                      ? "Show my existing access code"
                      : "Create a research access code",
                  )
                }
              >
                {issued ? "View your code" : "Create access code"}
              </button>
              <a href="/#examples" onClick={() => onOpenChange(false)}>
                Explore examples
              </a>
              <button disabled={busy} onClick={() => setContact(true)}>
                Contact Zishen
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="chat-error">
              {error}
            </p>
          )}
          {!contact && (
            <form className="chat-composer" onSubmit={submit}>
              <label className="sr-only" htmlFor="reception-input">
                Ask about OpenWallstreet
              </label>
              <textarea
                id="reception-input"
                ref={composer}
                placeholder="Ask about OpenWallstreet..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={1}
                maxLength={1200}
                disabled={busy}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Send to reception"
                disabled={busy || !input.trim()}
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                  <path d="m10 14 11-11" />
                </svg>
              </button>
            </form>
          )}
          <p className="chat-disclosure">
            AI reception · Project questions only · No investment advice
          </p>
        </section>
      )}
    </aside>
  );
}
