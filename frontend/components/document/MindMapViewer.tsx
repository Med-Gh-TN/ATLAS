import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  Node,
  Edge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng, toSvg } from 'html-to-image';

interface MindMapViewerProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  title?: string;
}

export default function MindMapViewer({ initialNodes, initialEdges, title = "Concept-Map" }: MindMapViewerProps) {
  // Local state management for drag/drop and graph manipulation
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedExtract, setSelectedExtract] = useState<string | null>(null);
  
  // Ref for targeting the DOM element during high-res image export
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.data && node.data.source_extract) {
      setSelectedExtract(node.data.source_extract);
    } else {
      setSelectedExtract(null);
    }
  }, []);

  const downloadImage = useCallback(async (format: 'png' | 'svg') => {
    if (reactFlowWrapper.current === null) return;
    
    // Filter to remove UI overlays (buttons, minimap) from the final exported image
    const filter = (node: HTMLElement) => {
      const exclusionClasses = ['react-flow__minimap', 'react-flow__controls', 'react-flow__panel'];
      return !exclusionClasses.some((className) => node.classList?.contains(className));
    };

    try {
      // Generate 2x scaled image for high resolution clarity
      const dataUrl = format === 'png' 
        ? await toPng(reactFlowWrapper.current, { filter, backgroundColor: '#ffffff', pixelRatio: 2 })
        : await toSvg(reactFlowWrapper.current, { filter, backgroundColor: '#ffffff' });
      
      const a = document.createElement('a');
      a.setAttribute('download', `atlas-${title.replace(/\s+/g, '-').toLowerCase()}.${format}`);
      a.setAttribute('href', dataUrl);
      a.click();
    } catch (error) {
      console.error('Error exporting image:', error);
      // In a full implementation, trigger a toast notification here
    }
  }, [title]);

  return (
    <div className="flex flex-col h-full w-full border rounded-lg bg-white overflow-hidden relative" ref={reactFlowWrapper} style={{ minHeight: '600px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        minZoom={0.2}
        maxZoom={4}
        className="bg-slate-50"
      >
        <Background color="#cbd5e1" gap={16} />
        <Controls className="bg-white shadow-md rounded-md" />
        <MiniMap zoomable pannable className="bg-white shadow-md rounded-md" />
        
        {/* US-18: High Resolution Export Controls */}
        <Panel position="top-right" className="flex gap-2">
          <button 
            onClick={() => downloadImage('png')}
            className="px-3 py-1.5 bg-blue-600 text-white rounded shadow hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            Export PNG
          </button>
          <button 
            onClick={() => downloadImage('svg')}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded shadow hover:bg-emerald-700 text-sm font-medium transition-colors"
          >
            Export SVG
          </button>
        </Panel>

        {/* US-18: Contextual Source Extract Panel */}
        {selectedExtract && (
          <Panel position="bottom-center" className="w-full max-w-3xl p-4 bg-white/95 backdrop-blur shadow-xl border-t border-slate-200 rounded-t-xl mb-2">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Extrait Source du Cours</h3>
              <button 
                onClick={() => setSelectedExtract(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed italic border-l-4 border-blue-500 pl-4 py-1">
              "{selectedExtract}"
            </p>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}