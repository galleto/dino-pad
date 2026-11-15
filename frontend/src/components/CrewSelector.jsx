export default function CrewSelector({ crew, activeCrewId, onChange }) {
  return (
    <div className="crew-selector" role="group" aria-label="Seleccionar tripulante">
      {crew.map((person) => (
        <button key={person.id} type="button" className={`crew-option${person.id === activeCrewId ? ' is-active' : ''}`} aria-pressed={person.id === activeCrewId} onClick={() => onChange(person.id)}>
          <span className="crew-initial">{person.name?.slice(0, 1) || '?'}</span><span>{person.name}<small>{person.role}</small></span>
        </button>
      ))}
    </div>
  );
}
