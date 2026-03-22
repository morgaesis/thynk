import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { VscArrowLeft } from 'react-icons/vsc';
import { getGraph } from '../api';
import type { GraphData, GraphEdge } from '../api';
import { useNoteStore } from '../stores/noteStore';
import { useUIStore } from '../stores/uiStore';

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  path: string;
  degree: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | string;
  target: SimNode | string;
}

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const openNoteByPath = useNoteStore((s) => s.openNoteByPath);
  const setShowGraph = useUIStore((s) => s.setShowGraph);

  // Load graph data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getGraph();
        if (!cancelled) {
          setGraphData(data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBack = useCallback(() => {
    setShowGraph(false);
  }, [setShowGraph]);

  // Build and render D3 force-directed graph
  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { nodes: rawNodes, edges: rawEdges } = graphData;
    if (rawNodes.length === 0) return;

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    // Compute degree (connection count) for node sizing/coloring
    const degree: Record<string, number> = {};
    rawNodes.forEach((n) => (degree[n.id] = 0));
    rawEdges.forEach((e) => {
      degree[e.from] = (degree[e.from] ?? 0) + 1;
      degree[e.to] = (degree[e.to] ?? 0) + 1;
    });

    const nodes: SimNode[] = rawNodes.map((n) => ({
      ...n,
      degree: degree[n.id] ?? 0,
    }));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = rawEdges
      .map((e: GraphEdge) => ({
        source: nodeById.get(e.from) ?? e.from,
        target: nodeById.get(e.to) ?? e.to,
      }))
      .filter(
        (l) => typeof l.source !== 'string' && typeof l.target !== 'string',
      );

    // Colour scale based on degree
    const maxDegree = Math.max(1, ...nodes.map((n) => n.degree));
    const colorScale = d3
      .scaleSequential(d3.interpolatePlasma)
      .domain([0, maxDegree]);

    // Radius scale
    const radiusScale = d3.scaleSqrt().domain([0, maxDegree]).range([5, 18]);

    // Container group (for zoom/pan)
    const g = svg.append('g');

    // Read theme-aware accent color from CSS variables
    const computedStyle = getComputedStyle(document.documentElement);
    const accentColor =
      computedStyle.getPropertyValue('--color-accent').trim() || '#6366f1';
    const nodeStrokeColor =
      computedStyle.getPropertyValue('--color-text-muted').trim() ||
      'rgba(255,255,255,0.3)';

    // Zoom behaviour
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString());
      });
    svg.call(zoom);

    // Arrow marker
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', accentColor)
      .attr('opacity', 0.6);

    // Links
    const link = g
      .append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', accentColor)
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Nodes
    const node = g
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => radiusScale(d.degree))
      .attr('fill', (d) => colorScale(d.degree))
      .attr('stroke', nodeStrokeColor)
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        setShowGraph(false);
        void openNoteByPath(d.path);
      });

    // Labels
    const label = g
      .append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.title)
      .attr('font-size', '11px')
      .attr('fill', 'currentColor')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => radiusScale(d.degree) + 14)
      .attr('pointer-events', 'none')
      .attr('opacity', 0.8);

    // Tooltip
    node.append('title').text((d) => d.title);

    // Drag behaviour
    const drag = d3
      .drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Force simulation
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(80),
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius((d) => radiusScale(d.degree) + 8),
      );

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);

      label.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, openNoteByPath, setShowGraph]);

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface-dark">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border dark:border-border-dark">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md
                     text-text-muted dark:text-text-muted-dark
                     hover:bg-border dark:hover:bg-border-dark transition-colors"
        >
          <VscArrowLeft size={14} />
          Back
        </button>
        <h1 className="text-base font-semibold text-text dark:text-text-dark">
          Note Graph
        </h1>
        {graphData && (
          <span className="text-xs text-text-muted dark:text-text-muted-dark ml-auto">
            {graphData.nodes.length} notes · {graphData.edges.length} links
          </span>
        )}
      </div>

      {/* Graph area */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-text-muted dark:text-text-muted-dark">
            Loading graph…
          </span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-red-500">{error}</span>
        </div>
      ) : graphData && graphData.nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-muted dark:text-text-muted-dark text-center max-w-xs">
            No notes yet. Create some notes and add{' '}
            <code className="px-1 py-0.5 rounded bg-border dark:bg-border-dark text-xs">
              [[wiki-links]]
            </code>{' '}
            between them to see the graph.
          </p>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="flex-1 w-full text-text dark:text-text-dark"
          aria-label="Note graph visualization"
        />
      )}
    </div>
  );
}
