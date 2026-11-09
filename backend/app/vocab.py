"""Controlled vocabularies shared by validation, seed data and the frontend (/api/meta/vocab)."""

ROLES = {
    "super_admin": ("Super Administrator", "Full system administration, user management and audit access."),
    "medical_admin": ("Medical Administrator", "Oversees hospital reporting across facilities; full clinical register access."),
    "hospital_staff": ("Hospital Reporting Staff", "Reports and maintains bite incidents for their own facility."),
    "veterinary_officer": ("Veterinary Officer", "Verifies community reports, inspects alerts, records vaccination and ABC activity."),
    "municipal_officer": ("Municipal Officer", "Field verification, environmental management and intervention tracking."),
    "community_reporter": ("Community Reporter", "Registered member of the public who submits observations."),
}

CONSOLE_ROLES = {"super_admin", "medical_admin", "veterinary_officer", "municipal_officer"}
FIELD_ROLES = {"veterinary_officer", "municipal_officer"}
ADMIN_ROLES = {"super_admin", "medical_admin"}
CLINICAL_ROLES = {"super_admin", "medical_admin", "hospital_staff"}

LOCATION_TYPES = {
    "residential": "Residential area",
    "school_college": "School / college",
    "market": "Market",
    "public_road": "Public road",
    "park": "Park",
    "other": "Other",
}
AGE_GROUPS = {"0-4": "0–4 years", "5-14": "5–14 years", "15-29": "15–29 years", "30-59": "30–59 years", "60+": "60+ years", "unknown": "Not recorded"}
SEX = {"female": "Female", "male": "Male", "other": "Other", "not_collected": "Not collected"}
DOG_OWNERSHIP = {"stray": "Stray / free-roaming", "owned": "Owned", "unknown": "Unknown"}
PROVOCATION = {"provoked": "Provoked", "unprovoked": "Unprovoked", "not_assessed": "Not assessed"}
INJURY_CATEGORY = {"cat_i": "Category I", "cat_ii": "Category II", "cat_iii": "Category III", "not_assessed": "Not yet clinically assessed"}
BODY_PART = {"head_neck": "Head / neck", "upper_limb": "Upper limb", "hand": "Hand / fingers", "trunk": "Trunk", "lower_limb": "Lower limb", "multiple": "Multiple sites", "not_recorded": "Not recorded"}
CLINICAL_ASSESSMENT = {"pending": "Pending", "assessed": "Assessed", "referred": "Referred to higher centre"}
WOUND_MGMT = {"not_started": "Not started", "done": "Wound washing / management done", "referred": "Referred", "not_applicable": "Not applicable"}
PEP_STATUS = {"not_referred": "Not referred", "referred": "Referred for PEP", "initiated": "PEP initiated", "completed": "PEP schedule completed", "not_indicated": "Not indicated (clinical decision)"}
RIG_STATUS = {"not_applicable": "Not applicable", "administered": "Administered", "referred": "Referred", "unavailable": "Unavailable at facility", "pending": "Pending decision"}
FOLLOW_UP = {"pending": "Follow-up pending", "in_progress": "In progress", "completed": "Completed", "lost": "Lost to follow-up", "not_required": "Not required"}
TIME_APPROX = {"early_morning": "Early morning (04–08)", "morning": "Morning (08–12)", "afternoon": "Afternoon (12–16)", "evening": "Evening (16–20)", "night": "Night (20–04)", "unknown": "Unknown"}

BEHAVIOURS = {
    "peaceful_roaming": "Dogs peacefully roaming",
    "resting": "Dogs resting or sleeping",
    "frequent_barking": "Dogs barking frequently",
    "chasing_vehicles": "Dogs chasing vehicles",
    "chasing_pedestrians": "Dogs chasing pedestrians",
    "threatening": "Dogs displaying threatening behaviour",
    "bite_reported": "Reported dog-bite incident",
    "waste_gathering": "Dogs gathering near waste-disposal areas",
    "injured_sick": "Injured or sick dogs",
    "needs_vet": "Dogs requiring veterinary assistance",
    "other": "Other observations",
}
# Categories that, when repeated, are prioritised for human review. They are *reported
# observations*, never an automatic classification of dogs as dangerous.
CONCERN_BEHAVIOURS = {"chasing_vehicles", "chasing_pedestrians", "threatening", "bite_reported"}
WELFARE_BEHAVIOURS = {"injured_sick", "needs_vet"}
BEHAVIOUR_LAYER_GROUPS = {
    "chasing": ["chasing_vehicles", "chasing_pedestrians"],
    "barking": ["frequent_barking"],
    "threatening": ["threatening"],
    "biting": ["bite_reported"],
    "injured": ["injured_sick", "needs_vet"],
    "other": ["peaceful_roaming", "resting", "waste_gathering", "other"],
}

GROUPING = {"together": "Observed together", "separately": "Observed separately", "both": "Both", "unknown": "Not sure"}
REPORT_STATUS = {"received": "Received", "under_verification": "Under verification", "verified": "Verified", "rejected": "Not verified / rejected"}

ALERT_STATUS = {
    "new": "New report",
    "under_review": "Under review",
    "field_verification_required": "Field verification required",
    "verified": "Verified",
    "intervention_assigned": "Intervention assigned",
    "action_completed": "Action completed",
    "closed": "Closed",
}
ALERT_TRANSITIONS = {
    "new": {"under_review", "closed"},
    "under_review": {"field_verification_required", "verified", "closed"},
    "field_verification_required": {"verified", "under_review", "closed"},
    "verified": {"intervention_assigned", "closed"},
    "intervention_assigned": {"action_completed", "verified"},
    "action_completed": {"closed", "intervention_assigned"},
    "closed": set(),
}
ALERT_TYPES = {
    "bite_cluster": "Bite-incident cluster",
    "repeated_behaviour": "Repeated concerning-behaviour reports",
    "animal_welfare": "Animal welfare / veterinary assistance",
    "combined_hotspot": "One Health investigation priority",
}

# Humane interventions only. Removal, culling or poisoning are deliberately not options.
INTERVENTION_TYPES = {
    "anti_rabies_vaccination": "Anti-rabies vaccination drive",
    "abc_sterilisation": "Animal Birth Control (ABC) sterilisation",
    "veterinary_treatment": "Veterinary assessment / treatment",
    "waste_management": "Waste & environmental management",
    "community_awareness": "Community awareness / bite-prevention education",
    "feeding_point_management": "Responsible feeding-point management",
    "rescue_rehabilitation": "Rescue & rehabilitation (injured animals)",
    "pep_awareness": "PEP access awareness with health department",
    "other_humane": "Other humane intervention",
}
INSPECTION_OUTCOMES = {"confirmed": "Reports confirmed", "partially_confirmed": "Partially confirmed", "not_confirmed": "Not confirmed"}
VAX_METHOD = {"documented_survey": "Coverage estimate from documented survey", "drive_record_only": "Drive record (no population survey)"}


def as_options(d: dict) -> list[dict]:
    return [{"value": k, "label": v if isinstance(v, str) else v[0]} for k, v in d.items()]
