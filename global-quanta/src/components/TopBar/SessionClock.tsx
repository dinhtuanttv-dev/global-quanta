interface Props {
  sessions: Record<string, 'open' | 'closed'>;
}

export default function SessionClock({ sessions }: Props) {
  return (
    <div className="sessions">
      {Object.entries(sessions).map(([name, status]) => (
        <div className="session" key={name}>
          <span className={`sd ${status === 'open' ? 'on' : 'off'}`} />
          {name}
        </div>
      ))}
    </div>
  );
}
