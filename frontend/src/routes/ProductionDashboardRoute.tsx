import { PageLayout } from "../components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Wrench, Link2, GitBranch, Sparkles, Building2, FileText, Rocket } from "lucide-react";

export function ProductionDashboardRoute(): JSX.Element {
  return (
    <PageLayout
      title="AIRGen Platform"
      description="Requirements Engineering and Traceability Platform"
    >
      <div className="space-y-8">
        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wrench className="h-5 w-5 text-primary" />
                Requirements Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create, organize, and manage requirements with structured documentation and versioning.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link2 className="h-5 w-5 text-primary" />
                Trace Links
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Establish and visualize relationships between requirements, design elements, and test cases.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GitBranch className="h-5 w-5 text-primary" />
                Baselines
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Capture requirement snapshots for version control and change impact analysis.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Generate requirements using AI assistance with context-aware suggestions.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Model system architecture and connect design elements to requirements.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Organize requirements into structured documents with sections and categorization.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Status Banner */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="py-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Rocket className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold">Platform Ready</h2>
            </div>
            <p className="text-muted-foreground text-lg">
              All core features are available. Navigate using the menu to explore the platform capabilities.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}