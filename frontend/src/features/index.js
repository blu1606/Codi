// Feature registry. Each feature folder owns its routes.jsx; importing it also runs any side-effect module that
// installs a cross-feature namespace on Codi (Codi.code, Codi.tutor, Codi.github, Codi.review, Codi.teach …).
import shell from './shell/routes';
import commerce from './commerce/routes';
import learning from './learning/routes';
import coding from './coding/routes';
import lecturer from './lecturer/routes';
import lecturerAi from './lecturer-ai/routes';
import admin from './admin/routes';

export const allRoutes = [...shell, ...commerce, ...learning, ...coding, ...lecturer, ...lecturerAi, ...admin];
