import { Link } from 'react-router-dom';
import { Navigation, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

export function AdminDashboard() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your taxi services
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxi Rides
            </CardTitle>
            <Navigation className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link to="/admin/rides">
              <Button variant="outline" size="sm">View All Rides</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Drivers
            </CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link to="/admin/drivers">
              <Button variant="outline" size="sm">Manage Drivers</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Link to="/admin/rides">
              <Button>
                <Navigation className="mr-2 h-4 w-4" />
                Taxi Rides
              </Button>
            </Link>
            <Link to="/admin/drivers">
              <Button variant="outline">
                <Users className="mr-2 h-4 w-4" />
                Manage Drivers
              </Button>
            </Link>
            <Link to="/">
              <Button variant="secondary">
                View Public Site
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
