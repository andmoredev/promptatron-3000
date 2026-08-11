/**
 * AboutTab Component
 * Displays AI agent building principles and attribution information
 * Implements responsive design and accessibility features
 */



const aiPrinciples = [
  {
    id: 1,
    title: "System prompts are the key to success",
    description: "Make them clear, specific, and consistent. Treat the prompt as a contract, not a trick. Follow the RISEN framework (role, input, steps, expectation, narrowing)."
  },
  {
    id: 2,
    title: "Minimize data context",
    description: "Provide just enough information for the LLM to decide if it needs tools. Don't overload with raw data that risks leakage, cost, or dilution."
  },
  {
    id: 3,
    title: "Tools are APIs",
    description: "Tools must be deterministic, idempotent, and unambiguous. Define all properties strongly and design workflows that \"do more.\""
  },
  {
    id: 4,
    title: "Validate and revise output",
    description: "Run generated content through policy, regulatory, and business rule checks. Regenerate if it fails."
  },
  {
    id: 5,
    title: "Use meta-agents",
    description: "Reinforce the primary LLM with specialized agents for error containment, fact-checking, and quality enforcement."
  },
  {
    id: 6,
    title: "Instrument everything",
    description: "Track tokens, prompt adherence, reasoning traces, and tool usage. Observability turns black-box behavior into accountable, auditable workflows."
  }
];

const attributions = {
  creators: [
    {
      name: "Andres Moreno",
      linkedinUrl: "https://www.linkedin.com/in/andmoredev/"
    },
    {
      name: "Allen Helton",
      linkedinUrl: "https://www.linkedin.com/in/allenheltondev/"
    }
  ],
  resources: {
    youtube: "https://youtube.com/@nullchecktv",
    github: "https://github.com/andmoredev/promptatron-3000"
  }
};

function AboutTab() {
  return (
    <div className="space-y-6 sm:space-y-8" role="tabpanel" aria-labelledby="about-tab">
      {/* AI Principles Section */}
      <section aria-labelledby="principles-heading">
        <h3 id="principles-heading" className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
          6 Principles of AI Agent Building
        </h3>
        <p className="text-sm sm:text-base text-gray-600 mb-6">
          These principles guide effective AI agent development and prompt engineering for reliable, scalable systems.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {aiPrinciples.map((principle) => (
            <article
              key={principle.id}
              className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              role="article"
              aria-labelledby={`principle-${principle.id}-title`}
            >
              <div
                className="flex-shrink-0 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-semibold"
                aria-label={`Principle ${principle.id}`}
                role="img"
              >
                {principle.id}
              </div>
              <div className="flex-1 min-w-0">
                <h4
                  id={`principle-${principle.id}-title`}
                  className="font-semibold text-gray-900 mb-1 text-sm leading-tight"
                >
                  {principle.title}
                </h4>
                <p className="text-xs text-gray-700 leading-snug">
                  {principle.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Attribution Section */}
      <hr />
      <section aria-labelledby="credits-heading">
        <div className="text-sm text-gray-600 w-full flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p>
            Created by{' '}
            <a
              href={attributions.creators[0].linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-medium"
              aria-label={`Visit ${attributions.creators[0].name}'s LinkedIn profile (opens in new tab)`}
            >
              {attributions.creators[0].name}
            </a>
            {' '}and{' '}
            <a
              href={attributions.creators[1].linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-medium"
              aria-label={`Visit ${attributions.creators[1].name}'s LinkedIn profile (opens in new tab)`}
            >
              {attributions.creators[1].name}
            </a>
          </p>
          <p>
            Learn more:{' '}
            <a
              href={attributions.resources.youtube}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-medium"
              aria-label="Visit Null Check TV YouTube Channel (opens in new tab)"
            >
              YouTube
            </a>
            {' '}|{' '}
            Source:{' '}
            <a
              href={attributions.resources.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-medium"
              aria-label="Visit GitHub Repository (opens in new tab)"
            >
              GitHub
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

export default AboutTab;
