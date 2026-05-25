/**
 * Shared animation variants for Framer Motion.
 * Import and use with <motion.div variants={fadeIn} initial="hidden" animate="visible">
 */

// Fade in
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
}

// Fade + slide up
export const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

// Fade + slide down
export const slideDown = {
  hidden: { opacity: 0, y: -15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

// Fade + slide from left
export const slideRight = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

// Scale in (for popups, modals)
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
}

// Stagger children — use on parent container
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
}

// Individual stagger item
export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

// Page transition (for view switching)
export const pageTransition = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.2 } },
}

// Hover scale for interactive cards
export const hoverScale = {
  whileHover: { scale: 1.01, transition: { duration: 0.2 } },
  whileTap: { scale: 0.99 },
}

// Bounce for notifications/badges
export const bounce = {
  initial: { scale: 0 },
  animate: { scale: 1, transition: { type: 'spring', stiffness: 500, damping: 25 } },
}

// Slide in for sidebar
export const sidebarSlide = {
  hidden: { x: -200, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } },
}
