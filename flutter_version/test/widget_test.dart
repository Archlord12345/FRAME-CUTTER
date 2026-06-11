import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:flutter_version/main.dart';
import 'package:flutter_version/providers/app_provider.dart';

void main() {
  testWidgets('Smoke test app loading', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AppProvider(),
        child: const MyApp(),
      ),
    );

    // Verify that our landing page text is present.
    expect(find.text("Découpez vos planches de photos en un clin d'œil"), findsOneWidget);
    expect(find.text("Sélectionner un fichier"), findsOneWidget);
  });
}
