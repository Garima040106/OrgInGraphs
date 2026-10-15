import type { Edge, Node } from "@xyflow/react";
import type { Department, Employee, Entity, Project } from "@/lib/types";
import { toGraphNode, type GraphNodeData } from "./normalize";

export function buildInitialGraph(
  employees: Employee[],
  departments: Department[],
  projects: Project[],
): { nodes: Node<GraphNodeData>[]; edges: Edge[]; totalEmployees: number } {
  const visibleEmployees = employees.slice(0, 24);
  const nodes: Node<GraphNodeData>[] = [];
  const edges: Edge[] = [];
  const known = new Set<string>();
  const addNode = (entity: Entity, position: { x: number; y: number }) => {
    if (!entity.id || known.has(entity.id)) return;
    known.add(entity.id);
    nodes.push(toGraphNode(entity, position));
  };
  departments.forEach((department, index) =>
    addNode(
      { ...department, entityType: "Department" },
      { x: 40, y: 55 + index * 180 },
    ),
  );
  visibleEmployees.forEach((employee, index) => {
    const row = Math.floor(index / 4);
    const column = index % 4;
    addNode(
      { ...employee, entityType: "Employee" },
      { x: 390 + column * 235, y: 55 + row * 155 },
    );
    if (employee.departmentId && known.has(employee.departmentId)) {
      edges.push({
        id: `${employee.departmentId}:WORKS_IN:${employee.id}`,
        source: employee.id,
        target: employee.departmentId,
        label: "works in",
        type: "smoothstep",
      });
    }
    if (employee.managerId && visibleEmployees.some((person) => person.id === employee.managerId)) {
      edges.push({
        id: `${employee.id}:REPORTS_TO:${employee.managerId}`,
        source: employee.id,
        target: employee.managerId,
        label: "reports to",
        type: "smoothstep",
      });
    }
  });
  projects.forEach((project, index) => {
    const position = { x: 1440, y: 100 + index * 190 };
    addNode({ ...project, entityType: "Project" }, position);
    const related = [...(project.owners ?? []), ...(project.contributors ?? [])];
    related.forEach((person) => {
      if (!known.has(person.id)) return;
      edges.push({
        id: `${person.id}:WORKS_ON:${project.id}`,
        source: person.id,
        target: project.id,
        label: "works on",
        type: "smoothstep",
      });
    });
  });
  return { nodes, edges, totalEmployees: employees.length };
}
