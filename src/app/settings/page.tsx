"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  CheckCircle2,
  Loader2,
  Settings,
  Sparkles,
  Save,
  LogOut,
  RefreshCw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface IntegrationStatus {
  gmail: { configured: boolean; connected: boolean; email?: string };
  office365?: { connected: boolean; email?: string };
  sms: { configured: boolean; phoneNumber?: string };
}

interface SettingsData {
  integrations: IntegrationStatus;
  preferences: { emailSignature: string };
  profile: { userName: string; userRole: string };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Profile form state
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");

  // Twilio form state
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");

  // Preferences
  const [emailSignature, setEmailSignature] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmailConnected") === "true") {
      fetchSettings();
      // Clean URL
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("o365Connected") === "true") {
      setSaveMessage("Office 365 connected successfully!");
      fetchSettings();
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("error")) {
      setSaveMessage(`Error: ${params.get("error")}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings(data);
      setUserName(data.profile?.userName || "");
      setUserRole(data.profile?.userRole || "");
      setEmailSignature(data.preferences?.emailSignature || "");
    } catch {
      setSaveMessage("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: userName, user_role: userRole }),
      });
      if (res.ok) {
        setSaveMessage("Profile saved!");
        fetchSettings();
      } else {
        setSaveMessage("Failed to save");
      }
    } catch {
      setSaveMessage("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(""), 3000);
    }
  }

  async function saveTwilioSettings() {
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twilio_account_sid: twilioSid || undefined,
          twilio_auth_token: twilioToken || undefined,
          twilio_phone_number: twilioPhone || undefined,
        }),
      });
      if (res.ok) {
        setSaveMessage("Twilio settings saved!");
        setTwilioSid("");
        setTwilioToken("");
        setTwilioPhone("");
        fetchSettings();
      } else {
        setSaveMessage("Failed to save");
      }
    } catch {
      setSaveMessage("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(""), 3000);
    }
  }

  async function savePreferences() {
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_signature: emailSignature }),
      });
      if (res.ok) {
        setSaveMessage("Preferences saved!");
      }
    } catch {
      setSaveMessage("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(""), 3000);
    }
  }

  async function disconnectGmail() {
    try {
      const res = await fetch("/api/auth/gmail", { method: "DELETE" });
      if (res.ok) {
        setSaveMessage("Gmail disconnected");
        fetchSettings();
      } else {
        setSaveMessage("Failed to disconnect");
      }
    } catch {
      setSaveMessage("Failed to disconnect");
    }
  }

  const baseInput = "w-full px-3 py-2.5 text-[13px] bg-background/80 border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted-foreground/50";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-background dark:via-background dark:to-indigo-950/20 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-background dark:via-background dark:to-indigo-950/20">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="p-2 rounded-xl hover:bg-accent/80 transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-glass">
              <Settings className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Settings</h1>
              <p className="text-[11px] text-muted-foreground">Configure email and SMS integrations</p>
            </div>
          </div>
        </div>

        {/* Save message */}
        {saveMessage && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-[13px] font-medium ${
            saveMessage.startsWith("Error") || saveMessage.startsWith("Failed")
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}>
            {saveMessage}
          </div>
        )}

        {/* Profile Section */}
        <section className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Profile</h2>
              <p className="text-[11px] text-muted-foreground">Your name appears in the AI greeting and conversation</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Your Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Farsheed"
                className={baseInput}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Role (optional)</label>
              <input
                type="text"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                placeholder="e.g. sales professional, founder"
                className={baseInput}
              />
            </div>
            <Button
              size="sm"
              disabled={saving}
              onClick={saveProfile}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 text-white gap-1.5 rounded-xl"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Profile
            </Button>
          </div>
        </section>

        {/* Gmail Section */}
        <section className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              settings?.integrations.gmail.connected ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-muted"
            }`}>
              <Mail className={`w-5 h-5 ${settings?.integrations.gmail.connected ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Email (Gmail)</h2>
              <p className="text-[11px] text-muted-foreground">Send and receive email through your Gmail account</p>
            </div>
          </div>

          {settings?.integrations.gmail.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 glass-surface rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-[13px] text-foreground">Connected as <strong>{settings.integrations.gmail.email}</strong></span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl"
                  onClick={() => { fetch("/api/gmail/sync", { method: "POST" }).then(() => setSaveMessage("Sync started!")); }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={disconnectGmail}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-foreground/80">
                Click below to sign in with Google and authorize email access.
              </p>
              <a href="/api/auth/gmail">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 text-white gap-1.5 rounded-xl"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Connect Gmail
                </Button>
              </a>
            </div>
          )}
        </section>

        {/* Office 365 Section */}
        <section className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              settings?.integrations.office365?.connected ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-muted"
            }`}>
              <Mail className={`w-5 h-5 ${settings?.integrations.office365?.connected ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Email & Calendar (Office 365)</h2>
              <p className="text-[11px] text-muted-foreground">Email, calendar, and contacts via Microsoft 365</p>
            </div>
          </div>

          {settings?.integrations.office365?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 glass-surface rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-[13px] text-foreground">Connected as <strong>{settings.integrations.office365.email}</strong></span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl"
                  onClick={() => { fetch("/api/office365/sync", { method: "POST" }).then(() => setSaveMessage("Sync started!")); }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={async () => {
                    await fetch("/api/auth/office365", { method: "DELETE" });
                    fetchSettings();
                    setSaveMessage("Office 365 disconnected");
                  }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-foreground/80">
                Click below to sign in with Microsoft and authorize email, calendar, and contact access.
              </p>
              <a href="/api/auth/office365">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 text-white gap-1.5 rounded-xl"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Connect Office 365
                </Button>
              </a>
            </div>
          )}
        </section>

        {/* Twilio Section */}
        <section className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              settings?.integrations.sms.configured ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-muted"
            }`}>
              <MessageSquare className={`w-5 h-5 ${settings?.integrations.sms.configured ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">SMS (Twilio)</h2>
              <p className="text-[11px] text-muted-foreground">Send and receive text messages via Twilio</p>
            </div>
          </div>

          {settings?.integrations.sms.configured && (
            <div className="flex items-center gap-2 p-3 glass-surface rounded-xl mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-[13px] text-foreground">
                Configured · Phone: <strong>{settings.integrations.sms.phoneNumber}</strong>
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Account SID</label>
              <input
                type="text"
                value={twilioSid}
                onChange={(e) => setTwilioSid(e.target.value)}
                placeholder={settings?.integrations.sms.configured ? "******* (saved)" : "ACxxxxxxxxxxxxxxxx"}
                className={baseInput}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Auth Token</label>
              <input
                type="password"
                value={twilioToken}
                onChange={(e) => setTwilioToken(e.target.value)}
                placeholder={settings?.integrations.sms.configured ? "******* (saved)" : "Your auth token"}
                className={baseInput}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={twilioPhone}
                onChange={(e) => setTwilioPhone(e.target.value)}
                placeholder={settings?.integrations.sms.configured ? settings.integrations.sms.phoneNumber : "+1234567890"}
                className={baseInput}
              />
            </div>
            <Button
              size="sm"
              disabled={saving || (!twilioSid && !twilioToken && !twilioPhone)}
              onClick={saveTwilioSettings}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 text-white gap-1.5 rounded-xl"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Twilio Settings
            </Button>
          </div>
        </section>

        {/* Preferences Section */}
        <section className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Preferences</h2>
              <p className="text-[11px] text-muted-foreground">Default settings for email and messaging</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Email Signature</label>
              <textarea
                value={emailSignature}
                onChange={(e) => setEmailSignature(e.target.value)}
                placeholder="Your email signature..."
                rows={3}
                className={baseInput + " resize-none"}
              />
            </div>
            <Button
              size="sm"
              disabled={saving}
              onClick={savePreferences}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-glass border-0 text-white gap-1.5 rounded-xl"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Preferences
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
