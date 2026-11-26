import { agendaDates, inSwipeWindow, partitionAgenda, type CalendarMarkKind } from "@/lib/notebook-calendar";
import { Sketch } from "@/components/Sketch";

export type CalendarAgendaRow = {
  id: string;
  date: string;
  title: string;
  detail: string;
  kind: CalendarMarkKind;
  completed: boolean;
};

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function DayGroup({ date, rows, today }: { date: string; rows: CalendarAgendaRow[]; today: string }) {
  const past = date < today;
  const swipe = inSwipeWindow(date, today);
  return (
    <section className="mt-4" aria-label={dayLabel(date)}>
      <h3 className={`notebook-data inline-block text-sm font-semibold ${date === today ? "notebook-swipe notebook-swipe-event" : ""}`}>
        {dayLabel(date)}
      </h3>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => {
          const struck = past || row.completed;
          return (
            <li key={row.id} className="min-w-0">
              <p className={`notebook-data inline-block max-w-full break-words text-sm font-medium ${swipe ? `notebook-swipe notebook-swipe-${row.kind}` : ""} ${struck ? "notebook-complete-rule" : ""}`}>
                {row.title}
                {struck ? <Sketch seed={`past:${row.id}`} kind="strike" tone="red" draw /> : null}
              </p>
              {row.completed ? (
                <span className="notebook-completion ml-1 align-middle">
                  <Sketch seed={`done:${row.id}`} kind="tick" draw />
                </span>
              ) : null}
              <p className="notebook-data text-xs text-muted-foreground">{row.detail}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NotebookCalendarList({
  rows,
  today,
  showHere,
}: {
  rows: CalendarAgendaRow[];
  today: string;
  showHere: boolean;
}) {
  const { earlier, ahead } = partitionAgenda(rows, today);
  const earlierDates = agendaDates(earlier);
  const aheadDates = agendaDates(ahead);
  return (
    <div className="mt-4 min-w-0">
      {earlierDates.length > 0 ? (
        <details className="rounded-md border border-border p-3">
          <summary className="notebook-heading cursor-pointer text-sm">Earlier</summary>
          {earlierDates.map((date) => (
            <DayGroup key={date} date={date} today={today} rows={earlier.filter((row) => row.date === date)} />
          ))}
        </details>
      ) : null}
      {showHere ? (
        <div className="notebook-here">
          <span className="notebook-here-rule">
            <Sketch seed={`here:${today}`} kind="line" tone="blue" />
          </span>
          <span className="notebook-heading text-sm">You are here</span>
        </div>
      ) : null}
      {aheadDates.length === 0 && earlierDates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on this month&apos;s list.</p>
      ) : (
        aheadDates.map((date) => (
          <DayGroup key={date} date={date} today={today} rows={ahead.filter((row) => row.date === date)} />
        ))
      )}
    </div>
  );
}
