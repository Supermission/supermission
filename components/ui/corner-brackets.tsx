interface CornerBracketsProps {
  size?: number
  opacity?: number
  color?: string
  className?: string
}

export function CornerBrackets({
  size = 20,
  opacity = 0.6,
  color = '#0080FF',
  className = ''
}: CornerBracketsProps) {
  return (
    <>
      {/* Top Left */}
      <div
        className={className}
        style={{
          position: 'absolute',
          top: '-1px',
          left: '-1px',
          width: `${size}px`,
          height: `${size}px`,
          borderTop: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          opacity
        }}
      />

      {/* Top Right */}
      <div
        className={className}
        style={{
          position: 'absolute',
          top: '-1px',
          right: '-1px',
          width: `${size}px`,
          height: `${size}px`,
          borderTop: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          opacity
        }}
      />

      {/* Bottom Left */}
      <div
        className={className}
        style={{
          position: 'absolute',
          bottom: '-1px',
          left: '-1px',
          width: `${size}px`,
          height: `${size}px`,
          borderBottom: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          opacity
        }}
      />

      {/* Bottom Right */}
      <div
        className={className}
        style={{
          position: 'absolute',
          bottom: '-1px',
          right: '-1px',
          width: `${size}px`,
          height: `${size}px`,
          borderBottom: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          opacity
        }}
      />
    </>
  )
}
