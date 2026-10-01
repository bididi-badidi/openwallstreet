import { examples } from "../lib/examples";
import { Arrow } from "./SiteChrome";
export function ExampleCards() {
  return (
    <section
      className="examples-section"
      id="examples"
      aria-labelledby="examples-heading"
    >
      <h2 id="examples-heading">Explore the samples</h2>
      <p>A closer look at the evidence.</p>
      <div className="example-grid">
        {examples.map((example) => (
          <a
            className="example-card"
            key={example.slug}
            href={`/examples/${example.slug}`}
          >
            <span
              className={`example-monogram ${example.slug}`}
              aria-hidden="true"
            >
              {example.monogram}
            </span>
            <span className="example-copy">
              <h3>{example.company}</h3>
              <span>{example.years}</span>
              <span className="example-description">{example.description}</span>
            </span>
            <Arrow />
          </a>
        ))}
      </div>
    </section>
  );
}
