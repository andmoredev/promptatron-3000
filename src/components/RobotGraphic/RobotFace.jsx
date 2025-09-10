/**
 * @fileoverview RobotFace component that renders SVG-based facial expressions
 */

import React from "react";

/**
 * RobotFace component that renders different facial expressions using SVG
 * @param {Object} props - Component props
 * @param {string} props.expression - The facial expression to render ('happy', 'thinking', 'talking', 'concerned')
 * @param {boolean} [props.animated=true] - Whether to enable animations
 * @param {string} [props.size='md'] - Size variant for scaling
 * @returns {JSX.Element} The RobotFace SVG component
 */
const RobotFace = ({ expression, animated = true, size = 'md' }) => {
  // Size configurations for SVG scaling
  const sizeMap = {
    sm: { width: 40, height: 40, scale: 0.8 },
    md: { width: 56, height: 56, scale: 1.0 },
    lg: { width: 80, height: 80, scale: 1.2 }
  };

  const { width, height, scale } = sizeMap[size] || sizeMap.md;

  // Common SVG props
  const svgProps = {
    width,
    height,
    viewBox: "0 0 100 100",
    className: `robot-face-svg robot-expression-${expression}`,
    "data-testid": "robot-face-svg"
  };

  // Render different expressions based on the expression prop
  const renderExpression = () => {
    switch (expression) {
      case 'happy':
        return renderHappyExpression(scale, animated);
      case 'thinking':
        return renderThinkingExpression(scale, animated);
      case 'talking':
        return renderTalkingExpression(scale, animated);
      case 'concerned':
        return renderConcernedExpression(scale, animated);
      default:
        return renderHappyExpression(scale, animated);
    }
  };

  return (
    <svg {...svgProps}>
      {renderExpression()}
    </svg>
  );
};

/**
 * Renders a happy facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @returns {JSX.Element} SVG elements for happy expression
 */
const renderHappyExpression = (scale, animated) => (
  <g className="robot-face-happy">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill="#f8fafc"
      stroke="#64748b"
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - happy/content */}
    <g className="robot-eyes">
      <circle
        cx="35"
        cy="40"
        r="4"
        fill="#1e293b"
        className={animated ? "robot-eye robot-eye-blink" : "robot-eye"}
      />
      <circle
        cx="65"
        cy="40"
        r="4"
        fill="#1e293b"
        className={animated ? "robot-eye robot-eye-blink" : "robot-eye"}
      />
    </g>

    {/* Happy mouth - smile */}
    <path
      d="M 35 65 Q 50 75 65 65"
      stroke="#059669"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      className="robot-mouth robot-mouth-happy"
    />

    {/* Cheek highlights for happiness */}
    <circle cx="25" cy="55" r="3" fill="#fecaca" opacity="0.6" className="robot-cheek" />
    <circle cx="75" cy="55" r="3" fill="#fecaca" opacity="0.6" className="robot-cheek" />
  </g>
);

/**
 * Renders a thinking facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @returns {JSX.Element} SVG elements for thinking expression
 */
const renderThinkingExpression = (scale, animated) => (
  <g className="robot-face-thinking">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill="#fefce8"
      stroke="#64748b"
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - focused/concentrated */}
    <g className="robot-eyes">
      <ellipse
        cx="35"
        cy="42"
        rx="3"
        ry="2"
        fill="#1e293b"
        className="robot-eye"
      />
      <ellipse
        cx="65"
        cy="42"
        rx="3"
        ry="2"
        fill="#1e293b"
        className="robot-eye"
      />
    </g>

    {/* Thinking mouth - neutral/slight frown */}
    <line
      x1="42"
      y1="68"
      x2="58"
      y2="68"
      stroke="#d97706"
      strokeWidth="2"
      strokeLinecap="round"
      className="robot-mouth robot-mouth-thinking"
    />

    {/* Thinking indicators - gears/dots */}
    <g className="robot-thinking-indicators">
      <circle
        cx="75"
        cy="25"
        r="2"
        fill="#d97706"
        className={animated ? "robot-thinking-dot robot-thinking-pulse" : "robot-thinking-dot"}
      />
      <circle
        cx="82"
        cy="30"
        r="1.5"
        fill="#f59e0b"
        className={animated ? "robot-thinking-dot robot-thinking-pulse-delayed" : "robot-thinking-dot"}
      />
      <circle
        cx="78"
        cy="35"
        r="1"
        fill="#fbbf24"
        className={animated ? "robot-thinking-dot robot-thinking-pulse-delayed-2" : "robot-thinking-dot"}
      />
    </g>

    {/* Eyebrows - slightly furrowed */}
    <g className="robot-eyebrows">
      <line x1="30" y1="32" x2="40" y2="35" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="35" x2="70" y2="32" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </g>
  </g>
);

/**
 * Renders a talking facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @returns {JSX.Element} SVG elements for talking expression
 */
const renderTalkingExpression = (scale, animated) => (
  <g className="robot-face-talking">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill="#eff6ff"
      stroke="#64748b"
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - alert and engaged */}
    <g className="robot-eyes">
      <circle
        cx="35"
        cy="40"
        r="4"
        fill="#1e293b"
        className="robot-eye"
      />
      <circle
        cx="65"
        cy="40"
        r="4"
        fill="#1e293b"
        className="robot-eye"
      />
      {/* Eye highlights for alertness */}
      <circle cx="37" cy="38" r="1" fill="#ffffff" className="robot-eye-highlight" />
      <circle cx="67" cy="38" r="1" fill="#ffffff" className="robot-eye-highlight" />
    </g>

    {/* Talking mouth - animated oval */}
    <ellipse
      cx="50"
      cy="65"
      rx="8"
      ry="5"
      fill="#1e293b"
      className={animated ? "robot-mouth robot-mouth-talking robot-mouth-animate" : "robot-mouth robot-mouth-talking"}
    />

    {/* Sound waves/speech indicators */}
    <g className="robot-speech-indicators">
      <path
        d="M 20 45 Q 15 50 20 55"
        stroke="#3b82f6"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        className={animated ? "robot-speech-wave robot-speech-wave-1" : "robot-speech-wave"}
      />
      <path
        d="M 15 40 Q 8 50 15 60"
        stroke="#60a5fa"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        className={animated ? "robot-speech-wave robot-speech-wave-2" : "robot-speech-wave"}
      />
      <path
        d="M 10 35 Q 2 50 10 65"
        stroke="#93c5fd"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        className={animated ? "robot-speech-wave robot-speech-wave-3" : "robot-speech-wave"}
      />
    </g>
  </g>
);

/**
 * Renders a concerned/error facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @returns {JSX.Element} SVG elements for concerned expression
 */
const renderConcernedExpression = (scale, animated) => (
  <g className="robot-face-concerned">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill="#fef2f2"
      stroke="#64748b"
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - worried/concerned */}
    <g className="robot-eyes">
      <ellipse
        cx="35"
        cy="42"
        rx="3"
        ry="4"
        fill="#1e293b"
        className="robot-eye"
      />
      <ellipse
        cx="65"
        cy="42"
        rx="3"
        ry="4"
        fill="#1e293b"
        className="robot-eye"
      />
    </g>

    {/* Concerned mouth - downward curve */}
    <path
      d="M 35 70 Q 50 60 65 70"
      stroke="#dc2626"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      className="robot-mouth robot-mouth-concerned"
    />

    {/* Worried eyebrows */}
    <g className="robot-eyebrows">
      <line x1="28" y1="30" x2="42" y2="33" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="33" x2="72" y2="30" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </g>

    {/* Error indicator - exclamation or warning symbol */}
    <g className="robot-error-indicator">
      <circle
        cx="80"
        cy="25"
        r="6"
        fill="#dc2626"
        className={animated ? "robot-error-symbol robot-error-pulse" : "robot-error-symbol"}
      />
      <text
        x="80"
        y="29"
        textAnchor="middle"
        fill="white"
        fontSize="8"
        fontWeight="bold"
        className="robot-error-text"
      >
        !
      </text>
    </g>
  </g>
);

export default RobotFace;