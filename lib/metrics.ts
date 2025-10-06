/**
 * Metrics collection system
 */

interface MetricValue {
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

interface Metric {
  type: 'counter' | 'gauge' | 'histogram';
  values: MetricValue[];
}

class MetricsCollector {
  private metrics = new Map<string, Metric>();

  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.record(name, 'counter', value, tags);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.record(name, 'gauge', value, tags);
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.record(name, 'histogram', value, tags);
  }

  private record(name: string, type: Metric['type'], value: number, tags?: Record<string, string>): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { type, values: [] });
    }

    const metric = this.metrics.get(name)!;
    metric.values.push({
      value,
      tags,
      timestamp: Date.now()
    });
  }

  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  getAll(): Map<string, Metric> {
    return new Map(this.metrics);
  }

  getSummary(name: string): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const metric = this.metrics.get(name);
    if (!metric || metric.values.length === 0) return null;

    const values = metric.values.map(v => v.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)]
    };
  }

  reset(): void {
    this.metrics.clear();
  }

  print(): void {
    console.log('\n📊 Metrics Summary:\n');

    for (const [name, metric] of this.metrics) {
      if (metric.type === 'counter') {
        const sum = metric.values.reduce((a, b) => a + b.value, 0);
        console.log(`  ${name}: ${sum}`);
      } else if (metric.type === 'gauge') {
        const latest = metric.values[metric.values.length - 1]?.value;
        console.log(`  ${name}: ${latest}`);
      } else if (metric.type === 'histogram') {
        const summary = this.getSummary(name);
        if (summary) {
          console.log(`  ${name}:`);
          console.log(`    count: ${summary.count}`);
          console.log(`    avg: ${summary.avg.toFixed(2)}ms`);
          console.log(`    p50: ${summary.p50.toFixed(2)}ms`);
          console.log(`    p95: ${summary.p95.toFixed(2)}ms`);
          console.log(`    p99: ${summary.p99.toFixed(2)}ms`);
        }
      }
    }

    console.log('');
  }
}

export const metrics = new MetricsCollector();
