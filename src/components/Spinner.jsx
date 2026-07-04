export default function Spinner({ full = false, label }) {
  return (
    <div className={full ? 'spinner-wrap spinner-full' : 'spinner-wrap'}>
      <div className="spinner" />
      {label && <p className="spinner-label">{label}</p>}
    </div>
  )
}
