"use client";

import type { CalendarEventsData, CalendarEventItem } from "@/types/conversation";
import { Calendar, MapPin, Users, ExternalLink } from "lucide-react";

function formatEventTime(startTime: string, endTime: string, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  const start = new Date(startTime);
  const end = new Date(endTime);
  const dateStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const startStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endStr = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateStr}, ${startStr} - ${endStr}`;
}

function EventRow({ event }: { event: CalendarEventItem }) {
  const isToday = new Date(event.startTime).toDateString() === new Date().toDateString();

  return (
    <div className={`p-3 rounded-xl glass-surface ${isToday ? "ring-1 ring-indigo-500/30" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isToday ? "bg-indigo-100 text-indigo-600" : "bg-muted text-muted-foreground"}`}>
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-foreground truncate">{event.subject}</span>
            {isToday && <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full">Today</span>}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {formatEventTime(event.startTime, event.endTime, event.isAllDay)}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
            {event.location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
            )}
            {event.attendees.length > 0 && (
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {event.attendees.length}</span>
            )}
            {event.contactName && (
              <span className="text-indigo-600">{event.contactName}</span>
            )}
          </div>
        </div>
        {event.webLink && (
          <a href={event.webLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function CalendarEvents({ data }: { data: CalendarEventsData }) {
  if (!data.events?.length) {
    return (
      <div className="glass-card rounded-xl p-4 text-center">
        <Calendar className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-[13px] text-muted-foreground">No upcoming events</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-indigo-600" />
        <h3 className="text-[13px] font-semibold text-foreground">Calendar Events</h3>
        <span className="text-[11px] text-muted-foreground">({data.events.length})</span>
      </div>
      <div className="space-y-2">
        {data.events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
