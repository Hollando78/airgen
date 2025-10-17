export type PackageRecord = {
  id: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  parentId?: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type PackageWithChildren = PackageRecord & {
  children: Array<PackageWithChildren | { type: 'block' | 'diagram'; id: string }>;
};
