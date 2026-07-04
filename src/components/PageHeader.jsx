export default function PageHeader({ icon, title, subtitle, action }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">
          {icon && <span className="page-icon">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
