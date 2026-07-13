import unittest
from pathlib import Path


HTML_PATH = Path(__file__).resolve().parent / "project-radar-architecture.html"


class ProjectRadarArchitectureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = HTML_PATH.read_text(encoding="utf-8")

    def test_cross_layer_connectors_are_drawn_above_layer_backgrounds(self):
        layer_two = self.html.index("<!-- Layer 2 -->")
        event_connector = self.html.index('data-edge="event-to-organizer-visible"')
        organizer = self.html.index('data-node="organizer"')
        self.assertLess(layer_two, event_connector)
        self.assertLess(event_connector, organizer)

        layer_three = self.html.index("<!-- Layer 3 -->")
        reentry_connector = self.html.index('data-edge="re-entry-to-query-visible"')
        radar_query = self.html.index('data-node="radar-query"')
        self.assertLess(layer_three, reentry_connector)
        self.assertLess(reentry_connector, radar_query)

    def test_diagram_covers_v0_assignment_and_execution_boundaries(self):
        self.assertIn("Non Project / 待分类", self.html)
        self.assertIn("弹窗纠正｜原因、证据与动作", self.html)
        self.assertIn("Radar Action Run：更新状态，不再生成 Radar", self.html)

    def test_scaled_desktop_labels_use_readable_font_sizes(self):
        self.assertIn(".node-subtitle {\n      fill: #485365;\n      font-size: 14px;", self.html)
        self.assertIn(".small-label {\n      fill: #485365;\n      font-size: 14px;", self.html)
        self.assertIn(".gate-text { fill: #414a5a; font-size: 13px;", self.html)

    def test_delivery_layer_has_room_for_two_distinct_rows(self):
        self.assertIn('viewBox="0 0 1600 1160"', self.html)
        self.assertIn(
            'class="layer layer-green" x="20" y="680" width="1560" height="460"',
            self.html,
        )
        self.assertIn(
            'x="42" y="742" width="1515" height="110"',
            self.html,
        )
        self.assertIn(
            'x="42" y="890" width="1515" height="230"',
            self.html,
        )

    def test_server_nodes_and_feedback_have_generous_gaps(self):
        self.assertIn('x="520" y="920" width="200" height="78"', self.html)
        self.assertIn('x="780" y="895" width="270" height="135"', self.html)
        self.assertIn('x="1110" y="920" width="150" height="78"', self.html)
        self.assertIn('x="1320" y="920" width="205" height="78"', self.html)
        self.assertIn('x="930" y="1065" width="245" height="40"', self.html)
        self.assertIn('x="1320" y="1065" width="205" height="40"', self.html)

    def test_context_bundle_copy_wraps_inside_its_card(self):
        self.assertIn('x="805" y="997">相关 Event、目标 Session</text>', self.html)
        self.assertIn('x="805" y="1019">Memory 与约束</text>', self.html)

    def test_state_return_line_routes_outside_the_node_area(self):
        self.assertIn(
            'data-edge="new-event-to-organizer" d="M 930 1085 H 10 V 640 H 425 V 580"',
            self.html,
        )


if __name__ == "__main__":
    unittest.main()
