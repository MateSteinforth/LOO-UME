/*
  Rhombicosidodecahedron PENTAGON U-FRAME + CENTRE LED PANEL
  NO PENTAGRAM OVERLAP V17
  ============================================================================

  Current sculpture print quantity: 11 identical pieces; north pole is open.

  DESIGN
  ------
  This version holds an additional 65 x 66 mm LED panel in the pentagonal
  opening:

    - centre panel shifted toward one pentagon side;
    - that side is OPEN;
    - pentagon piece keeps FOUR of the original five outer panel mounts;
    - missing fifth mount is handled by the separate two-hole bridge;
    - centre panel rests on a U-shaped support;
    - three screws attach the centre panel to this part;
    - all screw holes have 3.2 mm lead-ins tapering to 1.6 mm pilots.

  IMPORTANT V17 CHANGE
  --------------------
  The centre-panel U ribs are clipped against the pentagon footprint.

  This means NO rib can extend into the neighbouring pentagram/panel region,
  regardless of model orientation or viewing direction.

  A small inset gives real-world clearance.

  Modes:
      mode = "print"
      mode = "assembly"
      mode = "center"
*/

$fn = 40;


// ============================================================================
// OUTPUT
// ============================================================================

mode = "print";

print_quantity = 11;


// ============================================================================
// OUTER / SURROUNDING LED PANELS
// ============================================================================

pentagon_panel_edge = 66.0;
outer_panel_depth   = 65.0;

panel_thickness = 0.80;

outer_hole_from_corner = 8.0;

outer_to_middle_hole = 25.0;

middle_hole_from_edge_start =
    outer_hole_from_corner
    +
    outer_to_middle_hole;


hole_from_panel_edge_nominal = 8.0;

hole_edge_correction = 0.20;

hole_from_panel_edge =
    hole_from_panel_edge_nominal
    +
    hole_edge_correction;


surface_flush_correction = 0.50;

panel_mount_offset =
    panel_thickness
    +
    surface_flush_correction;

panel_front_offset =
    panel_mount_offset
    -
    panel_thickness;


pcb_hole_d_preview = 2.8;


// ============================================================================
// OPEN PENTAGON SIDE
// ============================================================================

open_outer_edge = 1;


function edge_adjacent_to_open(k) =
    (k == (open_outer_edge + 1) % 5)
    ||
    (k == (open_outer_edge + 4) % 5);


// ============================================================================
// PENTAGON COVER
// ============================================================================

cover_edge = 66.40;

cover_thickness = 0.80;

cover_corner_radius = 2.5;


// ============================================================================
// OUTER PANEL FLANGES
// ============================================================================

flange_thickness = 3.0;

flange_overlap = 1.25;

edge_lip_depth = 3.0;


pilot_hole_d = 1.60;

screw_leadin_d = 3.20;

screw_leadin_depth = 0.70;


screw_tab_width = 13.0;

screw_tab_end_margin = 4.5;

screw_tab_corner_radius = 2.3;

lip_corner_radius = 0.8;

flange_end_relief = 1.35;

lip_end_clearance = 13.0;


// ============================================================================
// OUTER FLANGE GUSSETS
// ============================================================================

gusset_plate_inset = 0.25;

gusset_plate_width = 6.50;

gusset_plate_embed = 0.45;

gusset_plate_rise = 0.70;


gusset_lip_flange_depth =
    flange_overlap
    +
    edge_lip_depth;


gusset_tab_flange_depth =
    flange_overlap
    +
    hole_from_panel_edge
    +
    screw_tab_end_margin;


gusset_flange_embed = 0.80;

gusset_x_margin = 0.35;

gusset_panel_clearance = 0.05;


// ============================================================================
// CENTRE LED PANEL
// ============================================================================

center_panel_w = 66.0;

center_panel_h = 65.0;

center_panel_clearance = 0.35;


center_panel_rotation = 234.0;


center_panel_offset_x =  9.62;

center_panel_offset_y = -7.04;


// Recess centre LED panel below pentagon surface.

center_panel_recess = 0.70;

center_panel_front_z =
    center_panel_recess;


center_support_z =
    center_panel_front_z
    +
    panel_thickness;


// Opening extends beyond the open pentagon edge.

center_open_extension = 80.0;

center_open_top_flare = 7.0;


// ============================================================================
// CENTRE PANEL SUPPORT SHELVES
// ============================================================================

center_support_thickness = 3.0;


center_pilot_hole_d = 1.60;

center_screw_leadin_d = 3.20;

center_screw_leadin_depth = 0.70;


center_shelf_inboard_depth = 12.5;

center_shelf_anchor_overlap = 1.8;

center_shelf_corner_radius = 2.0;


center_side_shelf_hole_margin = 5.0;


// Keep centre shelves inside pentagon border.

center_support_border_inset = 0.25;


center_connector_corner_clearance = 14.0;


// ============================================================================
// CENTRE PANEL HOLES
// ============================================================================

center_outer_hole_x =
    center_panel_w/2
    -
    8.0;


center_middle_hole_x = 0.0;


center_hole_y =
    center_panel_h/2
    -
    8.0;


center_u_holes = [

    [
        -center_outer_hole_x,
        -center_hole_y
    ],

    [
         center_middle_hole_x,
        -center_hole_y
    ],

    [
         center_outer_hole_x,
         center_hole_y
    ]
];


center_bridge_hole = [

    center_middle_hole_x,

    center_hole_y
];


// ============================================================================
// U-FRAME STIFFENING RIBS
// ============================================================================

u_rib_height = 2.0;

u_rib_embed = 0.25;

u_rib_width = 2.4;

u_rib_gap_from_pcb = 0.20;


// IMPORTANT V17:
//
// Clip ALL U-ribs to slightly inside the pentagon border.
//
// This replaces any attempt to move a rib "up", "down", "left" or "right".
// The actual rule is geometric:
//
//      RIB ∩ PENTAGON
//
// so no rib can ever overlap a neighbouring panel.

u_rib_border_inset = 0.35;


// ============================================================================
// GENERAL
// ============================================================================

clip_size = 320;

eps = 0.03;


// ============================================================================
// VECTOR HELPERS
// ============================================================================

function dot3(a,b) =

    a[0]*b[0]
    +
    a[1]*b[1]
    +
    a[2]*b[2];


function cross3(a,b) = [

    a[1]*b[2] - a[2]*b[1],

    a[2]*b[0] - a[0]*b[2],

    a[0]*b[1] - a[1]*b[0]

];


function length3(a) =

    sqrt(
        dot3(a,a)
    );


function unit3(a) =

    a
    /
    length3(a);


// ============================================================================
// LOCAL FRAME
// ============================================================================

module local_frame(
    origin,
    x_axis,
    y_axis,
    z_axis
) {

    multmatrix([

        [
            x_axis[0],
            y_axis[0],
            z_axis[0],
            origin[0]
        ],

        [
            x_axis[1],
            y_axis[1],
            z_axis[1],
            origin[1]
        ],

        [
            x_axis[2],
            y_axis[2],
            z_axis[2],
            origin[2]
        ],

        [0,0,0,1]

    ])

    children();
}


// ============================================================================
// RHOMBICOSIDODECAHEDRON PENTAGON GEOMETRY
// ============================================================================

sin18 = sin(18);

cos18 = cos(18);


u1 = [

     0.925614797,

    -0.229752916,

     0.300750477

];


u2 = [

    -0.925614797,

    -0.229752916,

     0.300750477

];


w1 = [

    -sin18,

     0,

     cos18

];


w2 = [

     sin18,

     0,

     cos18

];


v1 =
    unit3(
        cross3(
            w1,
            u1
        )
    );


v2 =
    unit3(
        cross3(
            w2,
            u2
        )
    );


edge_pent_1 =
    unit3(
        u1
        +
        v1
    );


edge_pent_2 =
    unit3(
        u2
        -
        v2
    );


square_in_1 =
    unit3(
        u1
        -
        v1
    );


pent_inward_normal =
    unit3(
        cross3(
            edge_pent_1,
            edge_pent_2
        )
    );


pent_center_dir =
    unit3(
        edge_pent_1
        +
        edge_pent_2
    );


pentagon_in_from_edge =
    unit3(
        cross3(
            pent_inward_normal,
            edge_pent_1
        )
    );


function face_radius(n,side) =

    side
    /
    (
        2*sin(180/n)
    );


pent_center =
    face_radius(
        5,
        pentagon_panel_edge
    )
    *
    pent_center_dir;


pent_x =
    unit3(
        -pent_center
    );


pent_z =
    pent_inward_normal;


pent_y =
    unit3(
        cross3(
            pent_z,
            pent_x
        )
    );


// ============================================================================
// WORLD -> PENTAGON FRAME
// ============================================================================

module world_to_pentagon_frame() {

    multmatrix([

        [
            pent_x[0],
            pent_x[1],
            pent_x[2],
            -dot3(
                pent_x,
                pent_center
            )
        ],

        [
            pent_y[0],
            pent_y[1],
            pent_y[2],
            -dot3(
                pent_y,
                pent_center
            )
        ],

        [
            pent_z[0],
            pent_z[1],
            pent_z[2],
            -dot3(
                pent_z,
                pent_center
            )
        ],

        [0,0,0,1]

    ])

    children();
}


// ============================================================================
// ROTATE AROUND PENTAGON EDGES
// ============================================================================

module at_pentagon_edge(k) {

    translate(pent_center)

        rotate(
            a = -72*k,
            v = pent_inward_normal
        )

            translate(-pent_center)

                children();
}


// ============================================================================
// 2D HELPERS
// ============================================================================

module rounded_rect_2d(
    x0,
    x1,
    y0,
    y1,
    radius
) {

    assert(

        x1 > x0 + 2*radius
        &&
        y1 > y0 + 2*radius,

        "Rounded rectangle too small"

    );


    hull() {

        for(
            x=[
                x0+radius,
                x1-radius
            ]
        )

            for(
                y=[
                    y0+radius,
                    y1-radius
                ]
            )

                translate([x,y])

                    circle(
                        r=radius
                    );
    }
}


module rounded_pentagon_2d(
    side,
    radius
) {

    circumradius =
        side
        /
        (
            2*sin(36)
        );


    offset(r=radius)

        offset(delta=-radius)

            polygon(

                points=[

                    for(k=[0:4])

                        [

                            circumradius
                            *
                            cos(72*k),

                            circumradius
                            *
                            sin(72*k)

                        ]
                ]
            );
}


// ============================================================================
// CENTRE PANEL TRANSFORM
// ============================================================================

module at_center_panel() {

    translate([

        center_panel_offset_x,

        center_panel_offset_y,

        0

    ])

        rotate([

            0,

            0,

            center_panel_rotation

        ])

            children();
}


// ============================================================================
// OPEN U CUTOUT
// ============================================================================

module center_panel_open_u_2d(extra=0) {

    w_bottom =
        center_panel_w
        +
        2*(
            center_panel_clearance
            +
            extra
        );


    w_top =
        w_bottom
        +
        2*center_open_top_flare;


    y0 =
        -center_panel_h/2
        -
        center_panel_clearance
        -
        extra;


    y_panel_top =
        center_panel_h/2
        +
        center_panel_clearance
        +
        extra;


    y1 =
        y_panel_top
        +
        center_open_extension;


    union() {

        translate([
            -w_bottom/2,
            y0
        ])

            square([

                w_bottom,

                y_panel_top-y0

            ]);


        polygon(

            points=[

                [
                    -w_bottom/2,
                     y_panel_top
                ],

                [
                     w_bottom/2,
                     y_panel_top
                ],

                [
                     w_top/2,
                     y1
                ],

                [
                    -w_top/2,
                     y1
                ]

            ]
        );
    }
}


// ============================================================================
// PENTAGON U COVER
// ============================================================================

module pentagon_u_cover() {

    difference() {

        linear_extrude(
            height=cover_thickness,
            convexity=8
        )

            rounded_pentagon_2d(
                cover_edge,
                cover_corner_radius
            );


        translate([
            0,
            0,
            -eps
        ])

            linear_extrude(
                height=cover_thickness+2*eps,
                convexity=4
            )

                at_center_panel()

                    center_panel_open_u_2d();
    }
}


// ============================================================================
// OUTER FLANGE FOOTPRINT
// ============================================================================

module outer_flange_footprint_2d(
    usable_length,
    hole_x,
    hole_y,
    lip_x0,
    lip_x1
) {

    union() {

        rounded_rect_2d(

            lip_x0,

            lip_x1,

            0,

            flange_overlap
            +
            edge_lip_depth,

            lip_corner_radius

        );


        rounded_rect_2d(

            hole_x
            -
            screw_tab_width/2,

            hole_x
            +
            screw_tab_width/2,

            0,

            hole_y
            +
            screw_tab_end_margin,

            screw_tab_corner_radius

        );
    }
}


// ============================================================================
// OUTER FLANGE
// ============================================================================

module canonical_outer_flange() {

    usable_length =
        pentagon_panel_edge
        -
        2*flange_end_relief;


    hole_x =
        middle_hole_from_edge_start
        -
        flange_end_relief;


    hole_y =
        flange_overlap
        +
        hole_from_panel_edge;


    lip_x0 =
        lip_end_clearance;


    lip_x1 =
        usable_length
        -
        lip_end_clearance;


    flange_origin =

          flange_end_relief
          *
          edge_pent_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    local_frame(

        flange_origin,

        edge_pent_1,

        square_in_1,

        w1

    )

        difference() {

            linear_extrude(
                height=flange_thickness,
                convexity=8
            )

                outer_flange_footprint_2d(

                    usable_length,

                    hole_x,

                    hole_y,

                    lip_x0,

                    lip_x1

                );


            translate([

                hole_x,

                hole_y,

                -eps

            ])

                cylinder(

                    d=pilot_hole_d,

                    h=
                        flange_thickness
                        +
                        2*eps,

                    $fn=32
                );
        }
}


// ============================================================================
// OUTER GUSSET
// ============================================================================

module gusset_interval(
    x0,
    x1,
    flange_origin,
    upper_depth
) {

    if(x1 > x0)

        hull() {

            local_frame(

                flange_origin,

                edge_pent_1,

                square_in_1,

                w1

            )

                translate([
                    x0,
                    0,
                    0
                ])

                    cube([

                        x1-x0,

                        upper_depth,

                        gusset_flange_embed

                    ]);


            local_frame(

                flange_end_relief
                *
                edge_pent_1,

                edge_pent_1,

                pentagon_in_from_edge,

                pent_inward_normal

            )

                translate([

                    x0,

                    gusset_plate_inset,

                    cover_thickness
                    -
                    gusset_plate_embed

                ])

                    cube([

                        x1-x0,

                        gusset_plate_width,

                        gusset_plate_embed
                        +
                        gusset_plate_rise

                    ]);
        }
}


// ============================================================================
// OUTER GUSSET RAW
// ============================================================================

module canonical_outer_gusset_raw(
    include_tab=true
) {

    usable_length =
        pentagon_panel_edge
        -
        2*flange_end_relief;


    hole_x =
        middle_hole_from_edge_start
        -
        flange_end_relief;


    lip_x0 =
        lip_end_clearance;


    lip_x1 =
        usable_length
        -
        lip_end_clearance;


    flange_origin =

          flange_end_relief
          *
          edge_pent_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    union() {

        gusset_interval(

            lip_x0
            +
            gusset_x_margin,

            lip_x1
            -
            gusset_x_margin,

            flange_origin,

            gusset_lip_flange_depth

        );


        if(include_tab)

            gusset_interval(

                hole_x
                -
                screw_tab_width/2
                +
                gusset_x_margin,

                hole_x
                +
                screw_tab_width/2
                -
                gusset_x_margin,

                flange_origin,

                gusset_tab_flange_depth

            );
    }
}


// ============================================================================
// PCB-SAFE GUSSET HALFSPACE
// ============================================================================

module canonical_outer_panel_inward_halfspace() {

    flange_origin =

          flange_end_relief
          *
          edge_pent_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    local_frame(

        flange_origin,

        edge_pent_1,

        square_in_1,

        w1

    )

        translate([

            -clip_size/2,

            -clip_size/2,

            gusset_panel_clearance

        ])

            cube([

                clip_size,

                clip_size,

                clip_size

            ]);
}


// ============================================================================
// OUTER GUSSET FINAL
// ============================================================================

module canonical_outer_gusset(
    include_tab=true
) {

    intersection() {

        canonical_outer_gusset_raw(
            include_tab
        );


        canonical_outer_panel_inward_halfspace();
    }
}


// ============================================================================
// FOUR OUTER FLANGES
// ============================================================================

module outer_four_flanges_local() {

    world_to_pentagon_frame()

        for(k=[0:4])

            if(
                k
                !=
                open_outer_edge
            )

                at_pentagon_edge(k)

                    canonical_outer_flange();
}


// ============================================================================
// FOUR OUTER GUSSETS
// ============================================================================

module outer_four_gussets_local() {

    intersection() {

        world_to_pentagon_frame()

            union() {

                for(k=[0:4])

                    if(
                        k
                        !=
                        open_outer_edge
                    )

                        at_pentagon_edge(k)

                            canonical_outer_gusset(

                                include_tab =
                                    !edge_adjacent_to_open(k)

                            );
            }


        translate([

            -clip_size/2,

            -clip_size/2,

            0

        ])

            cube([

                clip_size,

                clip_size,

                clip_size

            ]);
    }
}


// ============================================================================
// CENTRE PANEL U SUPPORTS — 2D
// ============================================================================

module center_u_shelves_2d() {

    left =
        -center_panel_w/2;


    right =
         center_panel_w/2;


    bottom =
        -center_panel_h/2;


    top =
         center_panel_h/2;


    anchor =
        center_panel_clearance
        +
        center_shelf_anchor_overlap;


    d =
        center_shelf_inboard_depth;


    left_shelf_top =
        -center_hole_y
        +
        center_side_shelf_hole_margin;


    right_shelf_bottom =
        center_hole_y
        -
        center_side_shelf_hole_margin;


    union() {

        rounded_rect_2d(

            left-anchor,

            left+d,

            bottom-anchor,

            left_shelf_top,

            center_shelf_corner_radius

        );


        rounded_rect_2d(

            left-anchor,

            center_middle_hole_x
            +
            4.5,

            bottom-anchor,

            bottom+d,

            center_shelf_corner_radius

        );


        rounded_rect_2d(

            right-d,

            right+anchor,

            right_shelf_bottom,

            top+anchor,

            center_shelf_corner_radius

        );
    }
}


// ============================================================================
// CENTRE SUPPORT KEEP-IN
// ============================================================================

module center_support_keepin() {

    translate([

        0,

        0,

        center_support_z-eps

    ])

        linear_extrude(

            height=
                center_support_thickness
                +
                2*eps,

            convexity=8

        )

            offset(
                delta=-center_support_border_inset
            )

                rounded_pentagon_2d(

                    cover_edge,

                    cover_corner_radius

                );
}


// ============================================================================
// CENTRE U SUPPORTS
// ============================================================================

module center_u_supports() {

    intersection() {

        translate([

            0,

            0,

            center_support_z

        ])

            linear_extrude(

                height=center_support_thickness,

                convexity=8

            )

                at_center_panel()

                    center_u_shelves_2d();


        center_support_keepin();
    }
}


// ============================================================================
// CENTRE PILOT CUTTERS
// ============================================================================

module center_u_pilot_cutters() {

    at_center_panel()

        for(
            p=center_u_holes
        ) {

            translate([

                p[0],

                p[1],

                center_support_z-eps

            ])

                cylinder(

                    d=center_pilot_hole_d,

                    h=
                        center_support_thickness
                        +
                        2*eps,

                    $fn=32

                );


            translate([

                p[0],

                p[1],

                center_support_z-eps

            ])

                cylinder(

                    h=
                        center_screw_leadin_depth
                        +
                        eps,

                    d1=center_screw_leadin_d,

                    d2=center_pilot_hole_d,

                    $fn=40

                );
        }
}


// ============================================================================
// CENTRE U RIB SHAPE
// ============================================================================

module center_u_ribs_2d() {

    left =
        -center_panel_w/2
        -
        center_panel_clearance
        -
        u_rib_gap_from_pcb;


    right =
         center_panel_w/2
        +
        center_panel_clearance
        +
        u_rib_gap_from_pcb;


    bottom =
        -center_panel_h/2
        -
        center_panel_clearance
        -
        u_rib_gap_from_pcb;


    top =
         center_panel_h/2
        +
        center_panel_clearance
        +
        u_rib_gap_from_pcb;


    union() {

        // LEFT RIB
        translate([

            left-u_rib_width,

            bottom

        ])

            square([

                u_rib_width,

                top
                -
                bottom
                -
                center_connector_corner_clearance

            ]);


        // BOTTOM RIB
        translate([

            left-u_rib_width,

            bottom-u_rib_width

        ])

            square([

                (
                    center_panel_w/2
                    +
                    8
                )
                -
                (
                    left-u_rib_width
                ),

                u_rib_width

            ]);


        // RIGHT RIB
        translate([

            right,

            bottom
            +
            center_connector_corner_clearance

        ])

            square([

                u_rib_width,

                top
                -
                (
                    bottom
                    +
                    center_connector_corner_clearance
                )

            ]);
    }
}


// ============================================================================
// V17 — HARD PENTAGON KEEP-IN FOR U RIBS
// ============================================================================

module center_u_rib_keepin() {

    translate([

        0,

        0,

        cover_thickness
        -
        u_rib_embed
        -
        eps

    ])

        linear_extrude(

            height=
                u_rib_height
                +
                u_rib_embed
                +
                2*eps,

            convexity=8

        )

            offset(
                delta=-u_rib_border_inset
            )

                rounded_pentagon_2d(

                    cover_edge,

                    cover_corner_radius

                );
}


// ============================================================================
// CENTRE U RIBS
// ============================================================================

module center_u_ribs() {

    intersection() {

        translate([

            0,

            0,

            cover_thickness
            -
            u_rib_embed

        ])

            linear_extrude(

                height=
                    u_rib_height
                    +
                    u_rib_embed,

                convexity=6

            )

                at_center_panel()

                    center_u_ribs_2d();


        center_u_rib_keepin();
    }
}


// ============================================================================
// OUTER PILOT CUTTER
// ============================================================================

module canonical_outer_pilot_cutter() {

    hole_x =
        middle_hole_from_edge_start
        -
        flange_end_relief;


    hole_y =
        flange_overlap
        +
        hole_from_panel_edge;


    flange_origin =

          flange_end_relief
          *
          edge_pent_1

        -

          flange_overlap
          *
          square_in_1

        +

          panel_mount_offset
          *
          w1;


    local_frame(

        flange_origin,

        edge_pent_1,

        square_in_1,

        w1

    )

        union() {

            translate([

                hole_x,

                hole_y,

                -12

            ])

                cylinder(

                    d=pilot_hole_d,

                    h=24,

                    $fn=32

                );


            translate([

                hole_x,

                hole_y,

                -eps

            ])

                cylinder(

                    h=
                        screw_leadin_depth
                        +
                        eps,

                    d1=screw_leadin_d,

                    d2=pilot_hole_d,

                    $fn=40

                );
        }
}


// ============================================================================
// OUTER FOUR CUTTERS
// ============================================================================

module outer_four_pilot_cutters_local() {

    world_to_pentagon_frame()

        for(k=[0:4])

            if(
                k
                !=
                open_outer_edge
            )

                at_pentagon_edge(k)

                    canonical_outer_pilot_cutter();
}


// ============================================================================
// CENTRE KEEP-OUT
// ============================================================================

center_keepout_extra_xy = 0.20;

center_keepout_height = 12.0;


module center_open_u_keepout_cutter() {

    at_center_panel()

        translate([

            0,

            0,

            -eps

        ])

            linear_extrude(

                height=center_keepout_height,

                convexity=4

            )

                center_panel_open_u_2d(

                    center_keepout_extra_xy

                );
}


// ============================================================================
// STRUCTURAL SHELL
// ============================================================================

module structural_u_shell() {

    difference() {

        union() {

            pentagon_u_cover();

            outer_four_flanges_local();

            outer_four_gussets_local();

            center_u_ribs();
        }


        center_open_u_keepout_cutter();
    }
}


// ============================================================================
// FINAL PART
// ============================================================================

module printable_part() {

    difference() {

        union() {

            structural_u_shell();

            center_u_supports();
        }


        outer_four_pilot_cutters_local();

        center_u_pilot_cutters();
    }
}


// ============================================================================
// OUTER PANEL PREVIEW
// ============================================================================

module canonical_outer_panel_preview() {

    preview_origin =
        panel_front_offset
        *
        w1;


    local_frame(

        preview_origin,

        edge_pent_1,

        square_in_1,

        w1

    )

        difference() {

            cube([

                pentagon_panel_edge,

                outer_panel_depth,

                panel_thickness

            ]);


            for(
                x=[

                    outer_hole_from_corner,

                    middle_hole_from_edge_start,

                    pentagon_panel_edge
                    -
                    outer_hole_from_corner

                ]
            )

                translate([

                    x,

                    hole_from_panel_edge_nominal,

                    -eps

                ])

                    cylinder(

                        d=pcb_hole_d_preview,

                        h=
                            panel_thickness
                            +
                            2*eps,

                        $fn=28

                    );
        }
}


// ============================================================================
// OUTER PANEL PREVIEW SET
// ============================================================================

module outer_panel_preview_set_local() {

    world_to_pentagon_frame()

        for(k=[0:4])

            at_pentagon_edge(k)

                canonical_outer_panel_preview();
}


// ============================================================================
// CENTRE PANEL PREVIEW
// ============================================================================

module center_panel_preview() {

    at_center_panel()

        translate([

            -center_panel_w/2,

            -center_panel_h/2,

            center_panel_front_z

        ])

            difference() {

                cube([

                    center_panel_w,

                    center_panel_h,

                    panel_thickness

                ]);


                for(
                    x_abs=[
                        8,
                        33,
                        58
                    ]
                ) {

                    x =
                        x_abs
                        -
                        center_panel_w/2;


                    for(
                        y_abs=[
                            8,
                            center_panel_h-8
                        ]
                    ) {

                        y =
                            y_abs
                            -
                            center_panel_h/2;


                        translate([

                            x,

                            y,

                            -eps

                        ])

                            cylinder(

                                d=pcb_hole_d_preview,

                                h=
                                    panel_thickness
                                    +
                                    2*eps,

                                $fn=28

                            );
                    }
                }
            }
}


// ============================================================================
// GENERATED-ASSEMBLY API
// ============================================================================

// Stable, uniquely named entrypoints let generated assembly files compose this
// tested part with the separate middle-panel connector without module-name
// collisions. They intentionally add no geometry of their own.

module pentagon_u_part() {
    printable_part();
}

module pentagon_u_outer_panel_previews() {
    outer_panel_preview_set_local();
}

module pentagon_u_center_panel_preview() {
    center_panel_preview();
}


// ============================================================================
// CHECKS
// ============================================================================

assert(

    open_outer_edge >= 0
    &&
    open_outer_edge <= 4,

    "open_outer_edge must be 0..4"

);


assert(

    center_open_top_flare >= 0,

    "center_open_top_flare must be non-negative"

);


assert(

    center_support_border_inset >= 0,

    "center_support_border_inset must be non-negative"

);


assert(

    u_rib_border_inset >= 0,

    "u_rib_border_inset must be non-negative"

);


assert(

    center_side_shelf_hole_margin
    >
    center_shelf_corner_radius,

    "center_side_shelf_hole_margin too small"

);


assert(

    abs(
        middle_hole_from_edge_start
        -
        pentagon_panel_edge/2
    )
    <
    0.001,

    "Middle outer mounting hole must be centred"

);


assert(

    center_screw_leadin_d
    >
    center_pilot_hole_d
    &&
    center_screw_leadin_depth > 0
    &&
    center_screw_leadin_depth
    <
    center_support_thickness,

    "Invalid centre screw lead-in"

);


assert(

    screw_leadin_d
    >
    pilot_hole_d
    &&
    screw_leadin_depth > 0
    &&
    screw_leadin_depth
    <
    flange_thickness,

    "Invalid outer screw lead-in"

);


// ============================================================================
// DIAGNOSTICS
// ============================================================================

echo(
    str(
        "Open pentagon edge: ",
        open_outer_edge
    )
);


echo(
    str(
        "Centre panel rotation: ",
        center_panel_rotation,
        " deg"
    )
);


echo(
    str(
        "Centre panel offset: [",
        center_panel_offset_x,
        ", ",
        center_panel_offset_y,
        "] mm"
    )
);


echo(
    str(
        "Centre panel recess: ",
        center_panel_recess,
        " mm"
    )
);


echo(
    str(
        "Centre shelf pentagon inset: ",
        center_support_border_inset,
        " mm"
    )
);


echo(
    str(
        "Centre rib pentagon inset: ",
        u_rib_border_inset,
        " mm"
    )
);


echo(
    "V17: all centre U ribs are hard-clipped to the pentagon boundary"
);


echo(
    str(
        "Current sculpture print quantity: ",
        print_quantity
    )
);


// ============================================================================
// OUTPUT
// ============================================================================

if(mode == "print") {

    printable_part();

} else if(mode == "assembly") {

    color([
        0.85,
        0.28,
        0.12,
        1.0
    ])

        printable_part();


    color([
        0.08,
        0.08,
        0.08,
        0.48
    ])

        outer_panel_preview_set_local();


    color([
        0.10,
        0.10,
        0.10,
        0.75
    ])

        center_panel_preview();

} else if(mode == "center") {

    color([
        0.85,
        0.28,
        0.12,
        1.0
    ])

        printable_part();


    color([
        0.10,
        0.10,
        0.10,
        0.75
    ])

        center_panel_preview();

} else {

    assert(
        false,
        "mode must be print, assembly or center"
    );
}
