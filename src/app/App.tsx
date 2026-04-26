import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from '../state/session';
import { SetupPage } from '../pages/SetupPage';
import { ScanPage } from '../pages/ScanPage';
import { ItemDetailPage } from '../pages/ItemDetailPage';
import { MoveItemPage } from '../pages/MoveItemPage';
import { AdjustQuantityPage } from '../pages/AdjustQuantityPage';
import { QuickCreatePage } from '../pages/QuickCreatePage';
import { LocationSearchPage } from '../pages/LocationSearchPage';
import { LocationDetailPage } from '../pages/LocationDetailPage';
import { TagSearchPage } from '../pages/TagSearchPage';

function GuardedRoute({ children }: { children: JSX.Element }): JSX.Element {
  const { session } = useSession();
  if (!session.connected || !session.connection) {
    return <Navigate to="/setup" replace />;
  }

  return children;
}

export default function App(): JSX.Element {
  const { session } = useSession();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={session.connected ? '/scan' : '/setup'} replace />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/scan"
        element={
          <GuardedRoute>
            <ScanPage />
          </GuardedRoute>
        }
      />
      <Route
        path="/item/:entityId"
        element={
          <GuardedRoute>
            <ItemDetailPage />
          </GuardedRoute>
        }
      />
      <Route
        path="/move/:entityId"
        element={
          <GuardedRoute>
            <MoveItemPage />
          </GuardedRoute>
        }
      />
      <Route
        path="/quantity/:entityId"
        element={
          <GuardedRoute>
            <AdjustQuantityPage />
          </GuardedRoute>
        }
      />
      <Route
        path="/create"
        element={
          <GuardedRoute>
            <QuickCreatePage />
          </GuardedRoute>
        }
      />
      <Route
        path="/locations"
        element={
          <GuardedRoute>
            <LocationSearchPage />
          </GuardedRoute>
        }
      />
      <Route
        path="/location/:entityId"
        element={
          <GuardedRoute>
            <LocationDetailPage />
          </GuardedRoute>
        }
      />
      <Route
        path="/tags"
        element={
          <GuardedRoute>
            <TagSearchPage />
          </GuardedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
